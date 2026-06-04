/**
 * espnow_rx.c — ESP-NOW receive subsystem.
 *
 * Uses the ESP-IDF esp_now API directly (no Arduino layer needed on C3).
 * Incoming frames are pushed to a FreeRTOS queue; the relay task drains it.
 */

#include "espnow_rx.h"

#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "esp_wifi.h"
#include "esp_now.h"
#include "esp_log.h"

static const char *TAG = "beacon:espnow";

static QueueHandle_t s_rx_queue = NULL;

static const uint8_t kBroadcastMac[6] = {0xff, 0xff, 0xff, 0xff, 0xff, 0xff};

/* ── Callbacks (run in WiFi task context) ─────────────────────────────── */

static void on_recv(const esp_now_recv_info_t *info,
                    const uint8_t             *data,
                    int                        len)
{
    if (!info || !data || len <= 0 || len > ESPNOW_MAX_FRAME) return;
    if (!s_rx_queue) return;

    espnow_rx_msg_t msg;
    memcpy(msg.src_mac, info->src_addr, 6);
    memcpy(msg.data, data, len);
    msg.data_len       = (size_t)len;
    msg.rssi           = (info->rx_ctrl) ? (int8_t)info->rx_ctrl->rssi : 0;
    msg.received_at_ms = (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);

    BaseType_t woken = pdFALSE;
    if (xQueueSendFromISR(s_rx_queue, &msg, &woken) != pdTRUE) {
        /* Queue full — oldest frame lost (beacon busy or badge hammering). */
        ESP_LOGD(TAG, "rx queue full; frame dropped");
    }
    if (woken) portYIELD_FROM_ISR();
}

static void on_send(const esp_now_send_info_t *info, esp_now_send_status_t status) {
    if (status != ESP_NOW_SEND_SUCCESS) {
        ESP_LOGD(TAG, "ESP-NOW send failed to " MACSTR, MAC2STR(info->des_addr));
    }
}

/* ── Public API ──────────────────────────────────────────────────────── */

int espnow_rx_init(void) {
    if (s_rx_queue == NULL) {
        s_rx_queue = xQueueCreate(ESPNOW_RX_QUEUE_DEPTH, sizeof(espnow_rx_msg_t));
        if (!s_rx_queue) {
            ESP_LOGE(TAG, "failed to create rx queue");
            return ESP_ERR_NO_MEM;
        }
    }

    esp_err_t rc = esp_now_init();
    if (rc != ESP_OK) {
        ESP_LOGE(TAG, "esp_now_init failed: %d", rc);
        return rc;
    }

    esp_now_register_recv_cb(on_recv);
    esp_now_register_send_cb(on_send);

    /* Add the broadcast peer so we can send BEACON_HELLO. */
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, kBroadcastMac, 6);
    peer.channel = 0; /* use AP channel */
    peer.ifidx   = WIFI_IF_STA;
    peer.encrypt = false;
    if (!esp_now_is_peer_exist(kBroadcastMac)) {
        esp_now_add_peer(&peer);
    }

    ESP_LOGI(TAG, "ESP-NOW initialised");
    return ESP_OK;
}

void espnow_rx_deinit(void) {
    esp_now_unregister_recv_cb();
    esp_now_unregister_send_cb();
    esp_now_deinit();
    ESP_LOGI(TAG, "ESP-NOW deinitialised");
}

bool espnow_rx_take(espnow_rx_msg_t *out, uint32_t timeout_ms) {
    if (!s_rx_queue || !out) return false;
    TickType_t ticks = (timeout_ms == portMAX_DELAY)
                     ? portMAX_DELAY
                     : pdMS_TO_TICKS(timeout_ms);
    return xQueueReceive(s_rx_queue, out, ticks) == pdTRUE;
}

int espnow_tx_unicast(const uint8_t dst_mac[6], const uint8_t *data, size_t len) {
    if (len == 0 || len > ESPNOW_MAX_FRAME) return ESP_ERR_INVALID_ARG;
    esp_err_t rc = esp_now_send(dst_mac, data, len);
    if (rc != ESP_OK) {
        ESP_LOGD(TAG, "unicast to " MACSTR " failed: %d", MAC2STR(dst_mac), rc);
    }
    return rc;
}

int espnow_tx_broadcast(const uint8_t *data, size_t len) {
    if (len == 0 || len > ESPNOW_MAX_FRAME) return ESP_ERR_INVALID_ARG;
    return esp_now_send(kBroadcastMac, data, len);
}

int espnow_add_peer(const uint8_t mac[6], uint8_t channel) {
    if (esp_now_is_peer_exist(mac)) return ESP_OK;
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, mac, 6);
    peer.channel = channel;
    peer.ifidx   = WIFI_IF_STA;
    peer.encrypt = false;
    esp_err_t rc = esp_now_add_peer(&peer);
    if (rc != ESP_OK) {
        ESP_LOGW(TAG, "add peer " MACSTR " failed: %d", MAC2STR(mac), rc);
    }
    return rc;
}
