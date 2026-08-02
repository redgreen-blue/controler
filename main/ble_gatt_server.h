#ifndef BLE_GATT_SERVER_H
#define BLE_GATT_SERVER_H

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize and start the BLE GATT server for WM8741 control.
 *
 * This function configures the BT controller and Bluedroid host, registers
 * a GATT service with command/response characteristics, and starts BLE
 * advertising.
 *
 * @return ESP_OK on success, or an error code on failure.
 */
esp_err_t ble_gatt_server_start(void);

#ifdef __cplusplus
}
#endif

#endif /* BLE_GATT_SERVER_H */
