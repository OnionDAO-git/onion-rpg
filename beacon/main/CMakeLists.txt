# Beacon main component.
# Components used: esp-now, WiFi, HTTP client, NVS, cJSON, SPIFFS, mbedtls.
idf_component_register(
    SRCS
        "main.c"
        "config.c"
        "espnow_rx.c"
        "http_relay.c"
        "beacon_hello.c"
        "challenge_config.c"
    INCLUDE_DIRS
        "."
    REQUIRES
        esp_wifi
        esp_event
        esp_now
        esp_http_client
        esp-tls
        nvs_flash
        json
        spiffs
        mbedtls
        app_update
)
