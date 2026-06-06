/**
 * main.c — ONION RPG ESP32-C3 beacon firmware entry point.
 *
 * Boot sequence:
 *   1. NVS init, SPIFFS mount.
 *   2. Config load (NVS + /spiffs/beacon_config.json).
 *   3. WiFi STA connect (blocking with retry).
 *   4. Fill g_cfg.espnow_mac from the WiFi interface MAC.
 *   5. ESP-NOW init (after WiFi so channel is locked to AP channel).
 *   6. Challenge config load (/spiffs/challenge_<id>.json).
 *   7. BEACON_HELLO task start.
 *   8. Relay task: drain ESP-NOW rx queue, POST to /api/relay, send response
 *      frames back to the badge via ESP-NOW unicast.
 *
 * USB-serial provisioning:
 *   Connect at 115200 baud and type one of:
 *     SET beacon_id b-ketchup-01
 *     SET challenge_id 0.1
 *     SET wifi_ssid CIC Guest
 *     SET wifi_pass 1nnovation
 *     SET server_url https://onion-rpg.example.com
 *     SET api_key sk-...
 *     DUMP         (print current config)
 *     RESET        (erase NVS and reboot)
 *   Values are persisted to NVS; take effect on next reboot.
 */

#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"

#include "esp_log.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "nvs_flash.h"
#include "esp_spiffs.h"
#include "esp_mac.h"

#include "config.h"
#include "beacon_config.h"
#include "espnow_rx.h"
#include "http_relay.h"
#include "beacon_hello.h"
#include "onion_proto.h"
#include "challenge_config.h"

static const char *TAG = "beacon:main";

/* ── WiFi event group ─────────────────────────────────────────────────── */

static EventGroupHandle_t s_wifi_event_group;
#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT      BIT1
#define WIFI_MAX_RETRY     10

static int s_retry_num = 0;

static void wifi_event_handler(void *arg, esp_event_base_t base,
                                int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        if (s_retry_num < WIFI_MAX_RETRY) {
            esp_wifi_connect();
            s_retry_num++;
            ESP_LOGI(TAG, "WiFi reconnect attempt %d/%d", s_retry_num, WIFI_MAX_RETRY);
        } else {
            xEventGroupSetBits(s_wifi_event_group, WIFI_FAIL_BIT);
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)data;
        ESP_LOGI(TAG, "WiFi connected, IP: " IPSTR, IP2STR(&event->ip_info.ip));
        s_retry_num = 0;
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

static bool wifi_connect(void) {
    s_wifi_event_group = xEventGroupCreate();

    esp_netif_create_default_wifi_sta();
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&cfg);

    esp_event_handler_instance_t inst_wifi, inst_ip;
    esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                        &wifi_event_handler, NULL, &inst_wifi);
    esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                        &wifi_event_handler, NULL, &inst_ip);

    wifi_config_t wifi_cfg = {};
    strlcpy((char *)wifi_cfg.sta.ssid,     g_cfg.wifi_ssid, sizeof(wifi_cfg.sta.ssid));
    strlcpy((char *)wifi_cfg.sta.password, g_cfg.wifi_pass, sizeof(wifi_cfg.sta.password));
    /* WPA-or-better so we join WPA/WPA2-mixed venue guest APs (e.g. "CIC Guest"),
     * not just pure WPA2. */
    wifi_cfg.sta.threshold.authmode = WIFI_AUTH_WPA_PSK;

    esp_wifi_set_mode(WIFI_MODE_STA);
    esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg);
    esp_wifi_set_ps(WIFI_PS_NONE);
    esp_wifi_start();

    ESP_LOGI(TAG, "Connecting to SSID: %s", g_cfg.wifi_ssid);

    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
                                            WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                                            pdFALSE, pdFALSE,
                                            pdMS_TO_TICKS(30000));

    (void)inst_wifi;
    (void)inst_ip;

    if (bits & WIFI_CONNECTED_BIT) return true;
    ESP_LOGE(TAG, "WiFi connect failed (SSID: %s)", g_cfg.wifi_ssid);
    return false;
}

/* ── SPIFFS mount ─────────────────────────────────────────────────────── */

static void spiffs_mount(void) {
    esp_vfs_spiffs_conf_t conf = {
        .base_path       = "/spiffs",
        .partition_label = NULL,
        .max_files       = 8,
        .format_if_mount_failed = true,
    };
    esp_err_t rc = esp_vfs_spiffs_register(&conf);
    if (rc != ESP_OK) {
        ESP_LOGW(TAG, "SPIFFS mount failed (%d); no file-based config", rc);
    }
}

/* ── USB-serial provisioning parser ──────────────────────────────────── */

/* Buffer for assembling a serial line (newline-terminated). */
static char s_serial_line[256];
static int  s_serial_pos = 0;

static void handle_serial_line(const char *line) {
    if (strncmp(line, "SET ", 4) == 0) {
        const char *rest = line + 4;
        const char *sp   = strchr(rest, ' ');
        if (!sp) { printf("Usage: SET <key> <value>\n"); return; }
        char key[64];
        int klen = (int)(sp - rest);
        if (klen <= 0 || klen >= (int)sizeof(key)) { printf("Bad key\n"); return; }
        strlcpy(key, rest, klen + 1);
        const char *val = sp + 1;
        esp_err_t err = config_set_string(key, val);
        if (err == ESP_OK) printf("OK: %s = %s\n", key, val);
        else               printf("ERR: NVS write failed (%d)\n", err);
    } else if (strcmp(line, "DUMP") == 0) {
        config_dump();
        printf("beacon_id    = %s\n", g_cfg.beacon_id);
        printf("challenge_id = %s\n", g_cfg.challenge_id);
        printf("wifi_ssid    = %s\n", g_cfg.wifi_ssid);
        printf("server_url   = %s\n", g_cfg.server_url);
    } else if (strcmp(line, "RESET") == 0) {
        printf("Erasing NVS and rebooting...\n");
        nvs_flash_erase();
        esp_restart();
    } else {
        printf("Unknown command: %s\n", line);
        printf("Commands: SET <key> <value>  DUMP  RESET\n");
    }
}

static void serial_task(void *arg) {
    (void)arg;
    while (1) {
        int c = getchar();
        if (c == EOF) { vTaskDelay(pdMS_TO_TICKS(10)); continue; }
        if (c == '\r') continue;
        if (c == '\n') {
            s_serial_line[s_serial_pos] = '\0';
            if (s_serial_pos > 0) handle_serial_line(s_serial_line);
            s_serial_pos = 0;
            continue;
        }
        if (s_serial_pos < (int)sizeof(s_serial_line) - 1) {
            s_serial_line[s_serial_pos++] = (char)c;
        }
    }
}

/* ── Relay task: the core bridge loop ─────────────────────────────────── */
/*
 * For each badge request:
 *   1. Reassemble ESP-NOW frames (may be chunked).
 *   2. POST the frame(s) to /api/relay.
 *   3. Send the response frames back to the badge via ESP-NOW unicast.
 *
 * Multiple badges can be served concurrently because:
 *   - We process one badge frame at a time from the queue.
 *   - The msgId in each frame lets us route responses back to the right badge.
 *   - We track up to RELAY_MAX_PEERS concurrent reassembler contexts.
 *
 * The relay task also handles:
 *   - VOICE_CAPTURE_SUBMIT: if the badge sends audio bytes in the body (future
 *     firmware extension), the beacon uploads them OOB and substitutes a ref.
 *     Today's badge doesn't send audio over ESP-NOW; this is a forward compat
 *     hook per CONTRACTS.md §3.
 */

#define RELAY_MAX_PEERS 8

/* One reassembler slot per active badge peer. */
typedef struct {
    uint8_t              mac[6];
    uint8_t              last_msg_id;
    onion_reassembler_t  reassembler;
    uint32_t             last_active_ms;
} peer_slot_t;

static peer_slot_t s_peers[RELAY_MAX_PEERS];

static peer_slot_t *find_or_alloc_peer(const uint8_t mac[6]) {
    uint32_t now_ms = (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);

    /* Find existing slot. */
    for (int i = 0; i < RELAY_MAX_PEERS; i++) {
        if (memcmp(s_peers[i].mac, mac, 6) == 0) {
            s_peers[i].last_active_ms = now_ms;
            return &s_peers[i];
        }
    }

    /* Find oldest / empty slot. */
    int oldest = 0;
    for (int i = 1; i < RELAY_MAX_PEERS; i++) {
        bool empty_i = (s_peers[i].mac[0] == 0 && s_peers[i].mac[1] == 0);
        bool empty_o = (s_peers[oldest].mac[0] == 0 && s_peers[oldest].mac[1] == 0);
        if (empty_i) { oldest = i; break; }
        if (!empty_o && s_peers[i].last_active_ms < s_peers[oldest].last_active_ms) {
            oldest = i;
        }
    }

    memcpy(s_peers[oldest].mac, mac, 6);
    s_peers[oldest].last_active_ms = now_ms;
    onion_reassembler_reset(&s_peers[oldest].reassembler);
    ESP_LOGD(TAG, "new peer slot %d for " MACSTR, oldest, MAC2STR(mac));

    /* Register as ESP-NOW peer (channel 0 = AP channel). */
    espnow_add_peer(mac, 0);

    return &s_peers[oldest];
}

/* Send an ERROR frame back to a badge. */
static void send_error(const uint8_t mac[6], uint16_t msg_id, const char *code) {
    char body[64];
    snprintf(body, sizeof(body), "{\"code\":\"%s\"}", code);
    uint8_t frame[ONION_ESPNOW_MAX_FRAME];
    size_t  fsz[1];
    int n = onion_encode_chunks(MSG_ERROR, msg_id,
                                body, strlen(body),
                                (uint8_t (*)[ONION_ESPNOW_MAX_FRAME])&frame,
                                fsz, 1);
    if (n > 0) espnow_tx_unicast(mac, frame, fsz[0]);
}

#define RELAY_OUT_MAX 32

static void relay_task(void *arg) {
    (void)arg;

    /* Per-call buffers on the stack would be too big; use static or heap. */
    static uint8_t in_frames[RELAY_OUT_MAX][240];
    static size_t  in_sizes[RELAY_OUT_MAX];
    static uint8_t out_frames[RELAY_OUT_MAX][240];
    static size_t  out_sizes[RELAY_OUT_MAX];

    ESP_LOGI(TAG, "relay task started");

    while (1) {
        espnow_rx_msg_t rx;
        /* Block up to 500 ms, then loop (allows checking health / doing nothing). */
        if (!espnow_rx_take(&rx, 500)) continue;

        /* Decode the incoming frame header. */
        onion_frame_t frame;
        if (!onion_decode_frame(rx.data, rx.data_len, &frame)) {
            ESP_LOGD(TAG, "bad frame from " MACSTR, MAC2STR(rx.src_mac));
            continue;
        }

        /* Look up (or allocate) a reassembler for this peer. */
        peer_slot_t *peer = find_or_alloc_peer(rx.src_mac);

        /* Reset reassembler if this is a new message (new msgId). */
        if (peer->reassembler.received > 0 &&
            peer->reassembler.msg_id != frame.msg_id) {
            ESP_LOGD(TAG, "new msgId %u from " MACSTR, frame.msg_id, MAC2STR(rx.src_mac));
            onion_reassembler_reset(&peer->reassembler);
        }

        bool complete = onion_reassembler_push(&peer->reassembler, &frame);
        if (!complete) {
            /* Waiting for more chunks; send nothing yet. */
            ESP_LOGD(TAG, "waiting for more chunks (got %u/%u)",
                     peer->reassembler.received, frame.total);
            continue;
        }

        /* We have a complete message. Forward to server. */
        const char   *body      = peer->reassembler.assembled;
        size_t        body_len  = peer->reassembler.assembled_len;
        uint16_t      msg_id    = peer->reassembler.msg_id;
        onion_msg_type_t mtype  = peer->reassembler.type;

        ESP_LOGD(TAG, "complete msg type=0x%02X msgId=%u len=%zu from " MACSTR,
                 mtype, msg_id, body_len, MAC2STR(rx.src_mac));

        /* Re-encode as a single relay-envelope frame. */
        int n_in = onion_encode_chunks(
            mtype, msg_id, body, body_len,
            in_frames, in_sizes, RELAY_OUT_MAX);

        if (n_in <= 0) {
            ESP_LOGW(TAG, "re-encode failed; dropping");
            send_error(rx.src_mac, msg_id, "ENCODE_FAIL");
            onion_reassembler_reset(&peer->reassembler);
            continue;
        }

        /* POST to server. */
        int out_count = 0;
        int rc = http_relay(
            (const uint8_t (*)[240])in_frames, in_sizes, n_in,
            out_frames, out_sizes, RELAY_OUT_MAX, &out_count);

        if (rc != 0) {
            ESP_LOGW(TAG, "http_relay failed");
            send_error(rx.src_mac, msg_id, "SERVER_ERROR");
            onion_reassembler_reset(&peer->reassembler);
            continue;
        }

        /* Relay response frames back to badge. */
        for (int i = 0; i < out_count; i++) {
            esp_err_t tx_rc = espnow_tx_unicast(rx.src_mac,
                                                out_frames[i], out_sizes[i]);
            if (tx_rc != ESP_OK) {
                ESP_LOGD(TAG, "tx frame %d/%d failed: %d", i + 1, out_count, tx_rc);
            }
            /* Small gap between frames to avoid ESP-NOW queue overflow on badge. */
            if (i < out_count - 1) vTaskDelay(pdMS_TO_TICKS(20));
        }

        onion_reassembler_reset(&peer->reassembler);
    }
}

/* ── App entry point ─────────────────────────────────────────────────── */

void app_main(void) {
    /* 1. NVS */
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        nvs_flash_init();
    }

    /* 2. SPIFFS */
    spiffs_mount();

    /* 3. Load config */
    config_load();
    config_dump();

    /* 4. Event loop + netif (required before WiFi) */
    esp_event_loop_create_default();
    esp_netif_init();

    /* 5. WiFi */
    if (!wifi_connect()) {
        ESP_LOGE(TAG, "No WiFi; relay disabled. Serial provisioning active.");
        /* Still run serial task for provisioning. */
        xTaskCreate(serial_task, "serial", 2048, NULL, 2, NULL);
        /* Idle forever — operator must SET wifi_ssid + wifi_pass then RESET. */
        while (1) vTaskDelay(pdMS_TO_TICKS(1000));
    }

    /* 6. Populate MAC */
    esp_read_mac(g_cfg.espnow_mac, ESP_MAC_WIFI_STA);
    ESP_LOGI(TAG, "Beacon MAC: " MACSTR, MAC2STR(g_cfg.espnow_mac));

    /* 7. ESP-NOW (after WiFi so channel is locked) */
    ret = espnow_rx_init();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "ESP-NOW init failed: %d", ret);
    }

    /* 8. Challenge config */
    challenge_config_load();

    /* 9. Start BEACON_HELLO task */
    beacon_hello_start();

    /* 10. Serial provisioning task */
    xTaskCreate(serial_task, "serial", 2048, NULL, 2, NULL);

    /* 11. Relay task (main work loop) */
    xTaskCreate(relay_task, "relay", 8192, NULL, 5, NULL);

    ESP_LOGI(TAG, "beacon '%s' running (challenge: %s)",
             g_cfg.beacon_id,
             g_cfg.challenge_id[0] ? g_cfg.challenge_id : "none");
}
