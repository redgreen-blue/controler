/*
 * SPDX-FileCopyrightText: 2024 Espressif Systems (Shanghai) CO LTD
 * SPDX-License-Identifier: Unlicense OR CC0-1.0
 *
 * BLE GATT server for WM8741 command/response interface.
 *
 * Service: 12345678-1234-5678-1234-56789abcdef0
 * CMD  char (write):  12345678-1234-5678-1234-56789abcdef1
 * RESP char (notify): 12345678-1234-5678-1234-56789abcdef2
 */

#include <stdio.h>
#include <string.h>
#include "ble_gatt_server.h"
#include "wm8741_commands.h"

#include "esp_log.h"
#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_gap_ble_api.h"
#include "esp_gatts_api.h"
#include "esp_gatt_common_api.h"

static const char *TAG = "ble_gatt";

#define WM8741_SERVICE_UUID             0xF0, 0xDE, 0xBC, 0x9A, 0x78, 0x56, 0x34, 0x12, 0x12, 0x34, 0x56, 0x78, 0x12, 0x34, 0x56, 0x78
#define WM8741_CMD_CHAR_UUID            0xF1, 0xDE, 0xBC, 0x9A, 0x78, 0x56, 0x34, 0x12, 0x12, 0x34, 0x56, 0x78, 0x12, 0x34, 0x56, 0x78
#define WM8741_RESP_CHAR_UUID           0xF2, 0xDE, 0xBC, 0x9A, 0x78, 0x56, 0x34, 0x12, 0x12, 0x34, 0x56, 0x78, 0x12, 0x34, 0x56, 0x78

#define GATTS_TABLE_TAG                 "GATTS_TABLE"
#define WM8741_DEVICE_NAME              "WM8741_DAC"
#define CMD_MAX_LEN                     128
#define RESP_MAX_LEN                    256

#define PROFILE_NUM                     1
#define PROFILE_APP_IDX                 0
#define SVC_INST_ID                     0

/* Attribute table indexes */
enum {
    IDX_SVC,
    IDX_CHAR_CMD,
    IDX_CHAR_VAL_CMD,
    IDX_CHAR_RESP,
    IDX_CHAR_VAL_RESP,
    IDX_CHAR_CFG_RESP,
    HRS_IDX_NB,
};

static uint16_t heart_rate_handle_table[HRS_IDX_NB];

static uint8_t adv_config_done = 0;
#define ADV_CONFIG_FLAG             (1 << 0)
#define SCAN_RSP_CONFIG_FLAG        (1 << 1)

static uint8_t adv_service_uuid[16] = {
    /* LSB first: 12345678-1234-5678-1234-56789abcdef0 */
    0xF0, 0xDE, 0xBC, 0x9A, 0x78, 0x56, 0x34, 0x12,
    0x12, 0x34, 0x56, 0x78, 0x12, 0x34, 0x56, 0x78
};

static esp_ble_adv_params_t adv_params = {
    .adv_int_min         = 0x20,
    .adv_int_max         = 0x40,
    .adv_type            = ADV_TYPE_IND,
    .own_addr_type       = BLE_ADDR_TYPE_PUBLIC,
    .channel_map         = ADV_CHNL_ALL,
    .adv_filter_policy   = ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY,
};

static esp_ble_adv_data_t adv_data = {
    .set_scan_rsp        = false,
    .include_name        = true,
    .include_txpower     = true,
    .min_interval        = 0x0006,
    .max_interval        = 0x0010,
    .appearance          = 0x00,
    .manufacturer_len    = 0,
    .p_manufacturer_data = NULL,
    .service_data_len    = 0,
    .p_service_data      = NULL,
    .service_uuid_len    = sizeof(adv_service_uuid),
    .p_service_uuid      = adv_service_uuid,
    .flag = (ESP_BLE_ADV_FLAG_GEN_DISC | ESP_BLE_ADV_FLAG_BREDR_NOT_SPT),
};

static esp_ble_adv_data_t scan_rsp_data = {
    .set_scan_rsp        = true,
    .include_name        = true,
    .include_txpower     = true,
    .min_interval        = 0x0006,
    .max_interval        = 0x0010,
    .appearance          = 0x00,
    .manufacturer_len    = 0,
    .p_manufacturer_data = NULL,
    .service_data_len    = 0,
    .p_service_data      = NULL,
    .service_uuid_len    = sizeof(adv_service_uuid),
    .p_service_uuid      = adv_service_uuid,
    .flag = (ESP_BLE_ADV_FLAG_GEN_DISC | ESP_BLE_ADV_FLAG_BREDR_NOT_SPT),
};

static const uint16_t primary_service_uuid = ESP_GATT_UUID_PRI_SERVICE;
static const uint16_t character_declaration_uuid = ESP_GATT_UUID_CHAR_DECLARE;
static const uint16_t character_client_config_uuid = ESP_GATT_UUID_CHAR_CLIENT_CONFIG;
static const uint8_t char_prop_write = ESP_GATT_CHAR_PROP_BIT_WRITE;
static const uint8_t char_prop_notify = ESP_GATT_CHAR_PROP_BIT_NOTIFY;
static const uint8_t resp_ccc[2] = {0x00, 0x00};

static uint8_t cmd_value[CMD_MAX_LEN] = {0};
static uint8_t resp_value[RESP_MAX_LEN] = {0};

/* Full 128-bit UUIDs for service and characteristics (used in attribute table) */
static const uint8_t service_uuid_full[16] = {WM8741_SERVICE_UUID};
static const uint8_t cmd_char_uuid_full[16] = {WM8741_CMD_CHAR_UUID};
static const uint8_t resp_char_uuid_full[16] = {WM8741_RESP_CHAR_UUID};

/* GATT attribute table */
static const esp_gatts_attr_db_t gatt_db[HRS_IDX_NB] = {
    /* Service Declaration */
    [IDX_SVC] = {
        {ESP_GATT_AUTO_RSP},
        {ESP_UUID_LEN_16, (uint8_t *)&primary_service_uuid, ESP_GATT_PERM_READ,
         sizeof(service_uuid_full), sizeof(service_uuid_full), (uint8_t *)service_uuid_full}
    },

    /* CMD Characteristic Declaration */
    [IDX_CHAR_CMD] = {
        {ESP_GATT_AUTO_RSP},
        {ESP_UUID_LEN_16, (uint8_t *)&character_declaration_uuid, ESP_GATT_PERM_READ,
         sizeof(uint8_t), sizeof(char_prop_write), (uint8_t *)&char_prop_write}
    },

    /* CMD Characteristic Value */
    [IDX_CHAR_VAL_CMD] = {
        {ESP_GATT_AUTO_RSP},
        {ESP_UUID_LEN_128, (uint8_t *)cmd_char_uuid_full,
         ESP_GATT_PERM_WRITE,
         CMD_MAX_LEN, sizeof(cmd_value), cmd_value}
    },

    /* RESP Characteristic Declaration */
    [IDX_CHAR_RESP] = {
        {ESP_GATT_AUTO_RSP},
        {ESP_UUID_LEN_16, (uint8_t *)&character_declaration_uuid, ESP_GATT_PERM_READ,
         sizeof(uint8_t), sizeof(char_prop_notify), (uint8_t *)&char_prop_notify}
    },

    /* RESP Characteristic Value */
    [IDX_CHAR_VAL_RESP] = {
        {ESP_GATT_AUTO_RSP},
        {ESP_UUID_LEN_128, (uint8_t *)resp_char_uuid_full,
         ESP_GATT_PERM_READ,
         RESP_MAX_LEN, sizeof(resp_value), resp_value}
    },

    /* RESP Client Characteristic Configuration Descriptor */
    [IDX_CHAR_CFG_RESP] = {
        {ESP_GATT_AUTO_RSP},
        {ESP_UUID_LEN_16, (uint8_t *)&character_client_config_uuid,
         ESP_GATT_PERM_READ | ESP_GATT_PERM_WRITE,
         sizeof(uint16_t), sizeof(resp_ccc), (uint8_t *)resp_ccc}
    },
};

static void gap_event_handler(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *param)
{
    switch (event) {
    case ESP_GAP_BLE_ADV_DATA_SET_COMPLETE_EVT:
        adv_config_done &= (~ADV_CONFIG_FLAG);
        if (adv_config_done == 0) {
            esp_ble_gap_start_advertising(&adv_params);
        }
        break;
    case ESP_GAP_BLE_SCAN_RSP_DATA_SET_COMPLETE_EVT:
        adv_config_done &= (~SCAN_RSP_CONFIG_FLAG);
        if (adv_config_done == 0) {
            esp_ble_gap_start_advertising(&adv_params);
        }
        break;
    case ESP_GAP_BLE_ADV_START_COMPLETE_EVT:
        if (param->adv_start_cmpl.status != ESP_BT_STATUS_SUCCESS) {
            ESP_LOGE(TAG, "Advertising start failed");
        } else {
            ESP_LOGI(TAG, "Advertising started");
        }
        break;
    case ESP_GAP_BLE_ADV_STOP_COMPLETE_EVT:
        if (param->adv_stop_cmpl.status != ESP_BT_STATUS_SUCCESS) {
            ESP_LOGE(TAG, "Advertising stop failed");
        } else {
            ESP_LOGI(TAG, "Advertising stopped");
        }
        break;
    default:
        break;
    }
}

static void send_response_notification(uint16_t conn_id, uint16_t attr_handle, const char *response)
{
    size_t len = strlen(response);
    if (len > RESP_MAX_LEN) {
        len = RESP_MAX_LEN;
    }

    esp_ble_gatts_send_indicate(
        heart_rate_handle_table[IDX_SVC],
        conn_id,
        heart_rate_handle_table[IDX_CHAR_VAL_RESP],
        len,
        (uint8_t *)response,
        false /* notification */
    );
}

static void gatts_profile_event_handler(esp_gatts_cb_event_t event,
                                        esp_gatt_if_t gatts_if,
                                        esp_ble_gatts_cb_param_t *param)
{
    switch (event) {
    case ESP_GATTS_REG_EVT: {
        ESP_LOGI(TAG, "REGISTER_APP_EVT, status %d, app_id %d", param->reg.status, param->reg.app_id);
        esp_err_t set_dev_name_ret = esp_ble_gap_set_device_name(WM8741_DEVICE_NAME);
        if (set_dev_name_ret != ESP_OK) {
            ESP_LOGE(TAG, "set device name failed, error code = %x", set_dev_name_ret);
        }

        adv_config_done |= ADV_CONFIG_FLAG;
        esp_err_t ret = esp_ble_gap_config_adv_data(&adv_data);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "config adv data failed, error code = %x", ret);
        }

        adv_config_done |= SCAN_RSP_CONFIG_FLAG;
        ret = esp_ble_gap_config_adv_data(&scan_rsp_data);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "config scan response data failed, error code = %x", ret);
        }

        esp_ble_gatts_create_attr_tab(gatt_db, gatts_if, HRS_IDX_NB, SVC_INST_ID);
        break;
    }

    case ESP_GATTS_CONNECT_EVT: {
        ESP_LOGI(TAG, "Connected, conn_id %d", param->connect.conn_id);
        break;
    }

    case ESP_GATTS_DISCONNECT_EVT: {
        ESP_LOGI(TAG, "Disconnected, reason 0x%04x", param->disconnect.reason);
        esp_ble_gap_start_advertising(&adv_params);
        break;
    }

    case ESP_GATTS_CREAT_ATTR_TAB_EVT: {
        if (param->add_attr_tab.status != ESP_GATT_OK) {
            ESP_LOGE(TAG, "Create attribute table failed, error code=0x%x", param->add_attr_tab.status);
        } else if (param->add_attr_tab.num_handle != HRS_IDX_NB) {
            ESP_LOGE(TAG, "Create attribute table abnormally, num_handle (%d) doesn't equal to HRS_IDX_NB(%d)",
                     param->add_attr_tab.num_handle, HRS_IDX_NB);
        } else {
            memcpy(heart_rate_handle_table, param->add_attr_tab.handles, sizeof(heart_rate_handle_table));
            esp_ble_gatts_start_service(heart_rate_handle_table[IDX_SVC]);
        }
        break;
    }

    case ESP_GATTS_WRITE_EVT: {
        if (!param->write.is_prep) {
            uint16_t handle = param->write.handle;
            if (handle == heart_rate_handle_table[IDX_CHAR_VAL_CMD]) {
                uint16_t len = param->write.len;
                if (len >= CMD_MAX_LEN) {
                    len = CMD_MAX_LEN - 1;
                }
                char cmd[CMD_MAX_LEN] = {0};
                memcpy(cmd, param->write.value, len);
                cmd[len] = '\0';

                ESP_LOGI(TAG, "Received CMD: %s", cmd);

                char response[RESP_MAX_LEN] = {0};
                (void)wm8741_handle_command(cmd, response, sizeof(response));
                send_response_notification(param->write.conn_id, handle, response);
            }
        }
        break;
    }

    default:
        break;
    }
}

static void gatts_event_handler(esp_gatts_cb_event_t event, esp_gatt_if_t gatts_if,
                                esp_ble_gatts_cb_param_t *param)
{
    if (event == ESP_GATTS_REG_EVT) {
        if (param->reg.status == ESP_GATT_OK) {
            /* Store the gatts_if for the profile */
        } else {
            ESP_LOGE(TAG, "Reg app failed, app_id %04x, status %d", param->reg.app_id, param->reg.status);
            return;
        }
    }

    gatts_profile_event_handler(event, gatts_if, param);
}

esp_err_t ble_gatt_server_start(void)
{
    esp_err_t ret;

    esp_bt_controller_config_t bt_cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    ret = esp_bt_controller_init(&bt_cfg);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "BT controller init failed: %d", ret);
        return ret;
    }

    ret = esp_bt_controller_enable(ESP_BT_MODE_BLE);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "BT controller enable failed: %d", ret);
        return ret;
    }

    ret = esp_bluedroid_init();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Bluedroid init failed: %d", ret);
        return ret;
    }

    ret = esp_bluedroid_enable();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Bluedroid enable failed: %d", ret);
        return ret;
    }

    ret = esp_ble_gatts_register_callback(gatts_event_handler);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "GATTS register callback failed: %d", ret);
        return ret;
    }

    ret = esp_ble_gap_register_callback(gap_event_handler);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "GAP register callback failed: %d", ret);
        return ret;
    }

    ret = esp_ble_gatts_app_register(0);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "GATTS app register failed: %d", ret);
        return ret;
    }

    ret = esp_ble_gatt_set_local_mtu(512);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Set local MTU failed: %d", ret);
        return ret;
    }

    ESP_LOGI(TAG, "BLE GATT server started");
    return ESP_OK;
}
