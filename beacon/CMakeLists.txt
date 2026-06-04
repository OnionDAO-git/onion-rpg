# ONION RPG — ESP32-C3 beacon firmware
# ESP-NOW <-> WiFi/HTTPS bridge (Point of Interest beacon).
# Target: ESP32-C3 (single-core, 2.4 GHz 802.11 + BLE, 4 MB flash).
# ESP-IDF v5.x required. Arduino-as-component optional (not used here).
cmake_minimum_required(VERSION 3.16)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(onion-beacon)
