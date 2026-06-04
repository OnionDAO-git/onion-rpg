/**
 * http_relay.c — HTTPS relay to the game server.
 *
 * Builds the JSON envelope:
 *   { "beaconId": "...", "frames": ["<base64>", ...] }
 * POSTs to <server_url>/api/relay with Bearer auth, parses the response
 *   { "frames": ["<base64>", ...] }
 * and decodes the base64 frames back into raw bytes for the beacon relay task.
 *
 * Uses the ESP-IDF esp_http_client with TLS (built-in certificate bundle).
 * cJSON handles serialisation/deserialisation.
 * mbedtls_base64 handles base64 encode/decode.
 */

#include "http_relay.h"
#include "beacon_config.h"

#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#include "esp_log.h"
#include "esp_http_client.h"
#include "esp_crt_bundle.h"
#include "cJSON.h"
#include "mbedtls/base64.h"

static const char *TAG = "beacon:http";

/* Maximum total size of the JSON POST body (all frames base64-encoded). */
#define HTTP_RELAY_MAX_BODY  (32 * 1024)
/* Maximum size of the HTTP response body. */
#define HTTP_RELAY_MAX_RESP  (32 * 1024)

/* ── base64 helpers ───────────────────────────────────────────────────── */

static char *b64_encode(const uint8_t *data, size_t len) {
    size_t olen = 0;
    mbedtls_base64_encode(NULL, 0, &olen, data, len);
    char *out = malloc(olen + 1);
    if (!out) return NULL;
    if (mbedtls_base64_encode((unsigned char *)out, olen + 1, &olen, data, len) != 0) {
        free(out);
        return NULL;
    }
    out[olen] = '\0';
    return out;
}

static bool b64_decode(const char *src, size_t src_len,
                       uint8_t *dst, size_t dst_cap, size_t *out_len) {
    size_t olen = 0;
    int rc = mbedtls_base64_decode(NULL, 0, &olen,
                                   (const unsigned char *)src, src_len);
    if (rc != MBEDTLS_ERR_BASE64_BUFFER_TOO_SMALL && rc != 0) return false;
    if (olen > dst_cap) return false;
    rc = mbedtls_base64_decode(dst, dst_cap, &olen,
                               (const unsigned char *)src, src_len);
    if (rc != 0) return false;
    *out_len = olen;
    return true;
}

/* ── HTTP response accumulator ────────────────────────────────────────── */

typedef struct {
    char  *buf;
    size_t len;
    size_t cap;
} resp_buf_t;

static esp_err_t http_event_handler(esp_http_client_event_t *evt) {
    resp_buf_t *rb = (resp_buf_t *)evt->user_data;
    if (!rb) return ESP_OK;

    switch (evt->event_id) {
    case HTTP_EVENT_ON_DATA:
        if (evt->data_len > 0) {
            size_t need = rb->len + evt->data_len + 1;
            if (need > HTTP_RELAY_MAX_RESP) {
                ESP_LOGW(TAG, "response too large; truncating");
                break;
            }
            if (need > rb->cap) {
                size_t new_cap = need + 512;
                char *p = realloc(rb->buf, new_cap);
                if (!p) { ESP_LOGE(TAG, "oom in http_event"); break; }
                rb->buf = p;
                rb->cap = new_cap;
            }
            memcpy(rb->buf + rb->len, evt->data, evt->data_len);
            rb->len += evt->data_len;
            rb->buf[rb->len] = '\0';
        }
        break;
    case HTTP_EVENT_DISCONNECTED:
    case HTTP_EVENT_ERROR:
        break;
    default:
        break;
    }
    return ESP_OK;
}

/* ── Public: relay frames ─────────────────────────────────────────────── */

int http_relay(
    const uint8_t  in_frames[][240],
    const size_t   in_sizes[],
    int            in_count,
    uint8_t        out_frames[][240],
    size_t         out_sizes[],
    int            out_max,
    int           *out_count)
{
    *out_count = 0;

    /* Build the JSON body. */
    cJSON *root  = cJSON_CreateObject();
    cJSON *farr  = cJSON_CreateArray();
    if (!root || !farr) {
        cJSON_Delete(root);
        return -1;
    }

    cJSON_AddStringToObject(root, "beaconId", g_cfg.beacon_id);
    cJSON_AddItemToObject(root, "frames", farr);

    for (int i = 0; i < in_count; i++) {
        char *b64 = b64_encode(in_frames[i], in_sizes[i]);
        if (!b64) {
            ESP_LOGE(TAG, "b64 encode failed for frame %d", i);
            cJSON_Delete(root);
            return -1;
        }
        cJSON_AddItemToArray(farr, cJSON_CreateString(b64));
        free(b64);
    }

    char *body_str = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (!body_str) return -1;
    size_t body_len = strlen(body_str);
    if (body_len > HTTP_RELAY_MAX_BODY) {
        ESP_LOGE(TAG, "POST body too large: %zu", body_len);
        free(body_str);
        return -1;
    }

    /* Build the URL. */
    char url[BEACON_STR_MAX + 32];
    snprintf(url, sizeof(url), "%s/api/relay", g_cfg.server_url);

    /* Build the auth header. */
    char auth_header[BEACON_STR_MAX + 16];
    snprintf(auth_header, sizeof(auth_header), "Bearer %s", g_cfg.api_key);

    /* Allocate response buffer. */
    resp_buf_t rb = {NULL, 0, 0};
    rb.buf = malloc(1024);
    rb.cap = 1024;
    if (!rb.buf) { free(body_str); return -1; }
    rb.buf[0] = '\0';

    /* Configure HTTP client. */
    esp_http_client_config_t cfg = {
        .url             = url,
        .method          = HTTP_METHOD_POST,
        .event_handler   = http_event_handler,
        .user_data       = &rb,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .timeout_ms      = 15000,
        .buffer_size_tx  = 2048,
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) {
        free(body_str);
        free(rb.buf);
        return -1;
    }

    esp_http_client_set_header(client, "Content-Type", "application/json");
    if (g_cfg.api_key[0]) {
        esp_http_client_set_header(client, "Authorization", auth_header);
    }
    esp_http_client_set_post_field(client, body_str, (int)body_len);

    esp_err_t err = esp_http_client_perform(client);
    int status    = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);
    free(body_str);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "HTTP request failed: %d", err);
        free(rb.buf);
        return -1;
    }
    if (status != 200) {
        ESP_LOGW(TAG, "server returned HTTP %d: %.*s", status, (int)rb.len, rb.buf);
        free(rb.buf);
        return -1;
    }

    /* Parse response. */
    cJSON *resp = cJSON_ParseWithLength(rb.buf, rb.len);
    free(rb.buf);
    if (!resp) {
        ESP_LOGE(TAG, "response JSON parse failed");
        return -1;
    }

    cJSON *resp_frames = cJSON_GetObjectItemCaseSensitive(resp, "frames");
    if (!cJSON_IsArray(resp_frames)) {
        ESP_LOGW(TAG, "response missing 'frames' array");
        cJSON_Delete(resp);
        return 0; /* no frames to relay back; not necessarily an error */
    }

    int count = 0;
    cJSON *item = NULL;
    cJSON_ArrayForEach(item, resp_frames) {
        if (count >= out_max) {
            ESP_LOGW(TAG, "too many response frames; truncating at %d", out_max);
            break;
        }
        if (!cJSON_IsString(item) || !item->valuestring) continue;

        size_t dec_len = 0;
        if (!b64_decode(item->valuestring, strlen(item->valuestring),
                        out_frames[count], 240, &dec_len)) {
            ESP_LOGW(TAG, "b64 decode failed for resp frame %d", count);
            continue;
        }
        out_sizes[count] = dec_len;
        count++;
    }

    cJSON_Delete(resp);
    *out_count = count;
    ESP_LOGD(TAG, "relayed %d -> %d frames", in_count, *out_count);
    return 0;
}

/* ── Public: voice upload ─────────────────────────────────────────────── */

int http_upload_voice(
    const uint8_t *audio_data,
    size_t         audio_len,
    char          *ref_out,
    size_t         ref_out_len)
{
    char url[BEACON_STR_MAX + 32];
    snprintf(url, sizeof(url), "%s/api/voice", g_cfg.server_url);

    char auth_header[BEACON_STR_MAX + 16];
    snprintf(auth_header, sizeof(auth_header), "Bearer %s", g_cfg.api_key);

    resp_buf_t rb = {NULL, 0, 0};
    rb.buf = malloc(512);
    rb.cap = 512;
    if (!rb.buf) return -1;
    rb.buf[0] = '\0';

    esp_http_client_config_t cfg = {
        .url               = url,
        .method            = HTTP_METHOD_POST,
        .event_handler     = http_event_handler,
        .user_data         = &rb,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .timeout_ms        = 30000,
        .buffer_size_tx    = 4096,
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) { free(rb.buf); return -1; }

    esp_http_client_set_header(client, "Content-Type", "audio/wav");
    if (g_cfg.api_key[0]) {
        esp_http_client_set_header(client, "Authorization", auth_header);
    }
    /* POST raw audio bytes; the server returns {"ref":"..."} */
    esp_http_client_set_post_field(client, (const char *)audio_data, (int)audio_len);

    esp_err_t err = esp_http_client_perform(client);
    int status    = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

    if (err != ESP_OK || status != 200) {
        ESP_LOGE(TAG, "voice upload failed: %d / HTTP %d", err, status);
        free(rb.buf);
        return -1;
    }

    /* Extract "ref" from {"ref":"..."} */
    cJSON *resp = cJSON_ParseWithLength(rb.buf, rb.len);
    free(rb.buf);
    if (!resp) return -1;

    cJSON *ref_item = cJSON_GetObjectItemCaseSensitive(resp, "ref");
    if (cJSON_IsString(ref_item) && ref_item->valuestring) {
        strlcpy(ref_out, ref_item->valuestring, ref_out_len);
        cJSON_Delete(resp);
        return 0;
    }

    cJSON_Delete(resp);
    return -1;
}
