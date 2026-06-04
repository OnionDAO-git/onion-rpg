/**
 * espnow_rx.h — ESP-NOW receive subsystem for the beacon.
 *
 * The beacon sits in a peculiar dual-radio mode:
 *   - WiFi STA connected to the game-server AP (or router) for HTTPS relay.
 *   - ESP-NOW on the same channel, receiving badge frames.
 *
 * The ESP32-C3 has one radio shared between WiFi and ESP-NOW; both operate on
 * the same channel. After WiFi associates we lock ESP-NOW to that channel.
 *
 * This module initialises ESP-NOW, registers a receive callback that pushes
 * incoming frames into a FreeRTOS queue, and exposes espnow_rx_take() so the
 * relay task can drain it.
 */
#pragma once

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#define ESPNOW_RX_QUEUE_DEPTH 16
#define ESPNOW_MAX_FRAME      240

typedef struct {
    uint8_t  src_mac[6];
    uint8_t  data[ESPNOW_MAX_FRAME];
    size_t   data_len;
    int8_t   rssi;
    uint32_t received_at_ms; /* xTaskGetTickCount() * portTICK_PERIOD_MS */
} espnow_rx_msg_t;

/**
 * Initialise ESP-NOW and register the receive callback.
 * Call once after WiFi is associated (so the channel is known).
 * Returns ESP_OK on success.
 */
int espnow_rx_init(void);

/**
 * De-initialise ESP-NOW (called on WiFi disconnect / restart).
 */
void espnow_rx_deinit(void);

/**
 * Block until a frame arrives, or timeout_ms elapses.
 * Returns true if a frame was placed into *out, false on timeout.
 */
bool espnow_rx_take(espnow_rx_msg_t *out, uint32_t timeout_ms);

/**
 * Unicast one frame to a specific badge MAC.
 * The badge MAC must have been added as a peer already (done in relay task).
 * Returns ESP_OK on success.
 */
int espnow_tx_unicast(const uint8_t dst_mac[6], const uint8_t *data, size_t len);

/**
 * Broadcast one frame (to all ESP-NOW peers / broadcast MAC).
 * Used for BEACON_HELLO.
 */
int espnow_tx_broadcast(const uint8_t *data, size_t len);

/**
 * Register a badge MAC as an ESP-NOW peer (idempotent).
 * channel = 0 means "use current AP channel".
 */
int espnow_add_peer(const uint8_t mac[6], uint8_t channel);

#ifdef __cplusplus
}
#endif
