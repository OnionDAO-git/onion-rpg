/**
 * beacon_hello.c — periodic BEACON_HELLO broadcast + server registration.
 */

#include "beacon_hello.h"
#include "beacon_config.h"
#include "onion_proto.h"
#include "espnow_rx.h"
#include "http_relay.h"

#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"

static const char *TAG = "beacon:hello";

static TaskHandle_t s_hello_task = NULL;
static volatile bool s_stop = false;

/* ── Build the BEACON_HELLO JSON body ────────────────────────────────── */

static void build_hello_json(char *buf, size_t buf_sz) {
    /* MAC as "AA:BB:CC:DD:EE:FF" */
    const uint8_t *m = g_cfg.espnow_mac;
    char mac_str[18];
    snprintf(mac_str, sizeof(mac_str),
             "%02X:%02X:%02X:%02X:%02X:%02X",
             m[0], m[1], m[2], m[3], m[4], m[5]);

    if (g_cfg.challenge_id[0]) {
        snprintf(buf, buf_sz,
                 "{\"b\":\"%s\",\"c\":\"%s\",\"m\":\"%s\"}",
                 g_cfg.beacon_id, g_cfg.challenge_id, mac_str);
    } else {
        snprintf(buf, buf_sz,
                 "{\"b\":\"%s\",\"c\":null,\"m\":\"%s\"}",
                 g_cfg.beacon_id, mac_str);
    }
}

/* ── Notify server of our presence (once per interval) ───────────────── */

static void register_with_server(const char *hello_json) {
    /* Encode as a BEACON_HELLO frame and send through the relay endpoint.
     * msgId=0 for hello; server upserts the beacons row and responds with ACK
     * (or ignores unknown msgId — both are fine). */
    uint8_t frames[4][ONION_ESPNOW_MAX_FRAME];
    size_t  frame_sizes[4];
    int     n = onion_encode_chunks(
        MSG_BEACON_HELLO, 0,
        hello_json, strlen(hello_json),
        frames, frame_sizes, 4);

    if (n <= 0) {
        ESP_LOGW(TAG, "failed to encode BEACON_HELLO for server reg");
        return;
    }

    uint8_t resp_frames[4][240];
    size_t  resp_sizes[4];
    int     resp_count = 0;

    int rc = http_relay(
        (const uint8_t (*)[240])frames, frame_sizes, n,
        resp_frames, resp_sizes, 4, &resp_count);

    if (rc != 0) {
        ESP_LOGD(TAG, "server registration HTTP failed (offline?)");
    } else {
        ESP_LOGD(TAG, "server registration ok; %d resp frames", resp_count);
    }
}

/* ── Hello task ──────────────────────────────────────────────────────── */

static void hello_task(void *arg) {
    (void)arg;
    char hello_json[256];

    uint32_t last_server_reg_ms = 0;
    /* Server registration fires every 30 s (6 x 5 s hello intervals). */
    const uint32_t SERVER_REG_INTERVAL_MS = 30000;

    while (!s_stop) {
        build_hello_json(hello_json, sizeof(hello_json));

        /* Encode + broadcast BEACON_HELLO burst. */
        uint8_t frame_buf[ONION_ESPNOW_MAX_FRAME];
        size_t  frame_size[1];
        int n = onion_encode_chunks(
            MSG_BEACON_HELLO, 0,
            hello_json, strlen(hello_json),
            (uint8_t (*)[ONION_ESPNOW_MAX_FRAME])&frame_buf,
            frame_size, 1);

        if (n > 0) {
            for (int burst = 0; burst < BEACON_HELLO_BURST; burst++) {
                espnow_tx_broadcast(frame_buf, frame_size[0]);
                if (burst < BEACON_HELLO_BURST - 1) {
                    vTaskDelay(pdMS_TO_TICKS(50));
                }
            }
            ESP_LOGD(TAG, "broadcast BEACON_HELLO: %s", hello_json);
        }

        /* Periodic server registration. */
        uint32_t now_ms = (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);
        if (now_ms - last_server_reg_ms >= SERVER_REG_INTERVAL_MS) {
            register_with_server(hello_json);
            last_server_reg_ms = now_ms;
        }

        vTaskDelay(pdMS_TO_TICKS(BEACON_HELLO_INTERVAL_MS));
    }

    s_hello_task = NULL;
    vTaskDelete(NULL);
}

/* ── Public API ──────────────────────────────────────────────────────── */

void beacon_hello_start(void) {
    s_stop = false;
    if (s_hello_task == NULL) {
        xTaskCreate(hello_task, "beacon_hello", 4096, NULL, 3, &s_hello_task);
        ESP_LOGI(TAG, "hello task started (interval %d ms)", BEACON_HELLO_INTERVAL_MS);
    }
}

void beacon_hello_stop(void) {
    s_stop = true;
    /* Task will exit on its next wakeup. */
}
