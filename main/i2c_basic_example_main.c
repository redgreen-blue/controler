/*
 * SPDX-FileCopyrightText: 2024 Espressif Systems (Shanghai) CO LTD
 * SPDX-License-Identifier: Unlicense OR CC0-1.0
 *
 * WM8741 Control over BLE
 *
 * The web control UI is hosted on GitHub Pages (HTTPS). The ESP32 only
 * exposes a BLE GATT server that accepts text commands and sends back
 * notifications. Wi-Fi, TCP and HTTP are no longer required.
 */

#include <stdio.h>
#include <string.h>
#include "sdkconfig.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "driver/i2c_master.h"
#include "wm8741_commands.h"
#include "ble_gatt_server.h"

/* ==================== I2C 配置 ==================== */
#define I2C_MASTER_SCL_IO           CONFIG_I2C_MASTER_SCL
#define I2C_MASTER_SDA_IO           CONFIG_I2C_MASTER_SDA
#define I2C_MASTER_NUM              I2C_NUM_0
#define I2C_MASTER_FREQ_HZ          CONFIG_I2C_MASTER_FREQUENCY
#define I2C_MASTER_TIMEOUT_MS       1000

/* ==================== 影子寄存器 ==================== */
uint8_t wm8741_regs[0x80];

/* ==================== 全局变量 ==================== */
static const char *TAG = "wm8741";
static i2c_master_bus_handle_t bus_handle;
i2c_master_dev_handle_t dev_handle;

/* ==================== I2C 写函数 ==================== */
esp_err_t wm8741_write_reg(i2c_master_dev_handle_t dev, uint8_t reg, uint8_t data)
{
    uint8_t write_buf[2] = { (reg << 1) | 0x00, data };
    esp_err_t ret = i2c_master_transmit(dev, write_buf, sizeof(write_buf), I2C_MASTER_TIMEOUT_MS);
    if (ret == ESP_OK) {
        wm8741_regs[reg] = data;
    }
    return ret;
}

/* ==================== 安全修改寄存器特定位 ==================== */
esp_err_t wm8741_update_reg_bit(uint8_t reg, uint8_t bit_mask, uint8_t bit_value)
{
    uint8_t current = wm8741_regs[reg];
    if (bit_value) current |= bit_mask;
    else current &= ~bit_mask;
    return wm8741_write_reg(dev_handle, reg, current);
}

/* ==================== 设置衰减（10位）==================== */
void wm8741_set_attenuation(uint16_t att_value)
{
    if (att_value > 1023) att_value = 1023;
    uint8_t lsb = att_value & 0x1F;
    uint8_t msb = (att_value >> 5) & 0x1F;
    wm8741_write_reg(dev_handle, WM8741_REG_DACL_LSB, lsb | ATTEN_UPDATE);
    wm8741_write_reg(dev_handle, WM8741_REG_DACL_MSB, msb | ATTEN_UPDATE);
    wm8741_write_reg(dev_handle, WM8741_REG_DACR_LSB, lsb | ATTEN_UPDATE);
    wm8741_write_reg(dev_handle, WM8741_REG_DACR_MSB, msb | ATTEN_UPDATE);
}

/* ==================== WM8741 初始化 ==================== */
static void wm8741_init(void)
{
    ESP_LOGI(TAG, "Configuring WM8741...");
    wm8741_write_reg(dev_handle, WM8741_REG_SOFT_RESET, 0x00);
    vTaskDelay(pdMS_TO_TICKS(10));

    uint8_t mode1 = 0x00;
    wm8741_write_reg(dev_handle, WM8741_REG_MODE_CTRL1, mode1);

    uint8_t format = (FMT_IWL_24 << FMT_IWL_SHIFT) | (FMT_I2S << FMT_FMT_SHIFT);
    wm8741_write_reg(dev_handle, WM8741_REG_FORMAT_CTRL, format);

    uint8_t mode2 = (2 << 0);
    wm8741_write_reg(dev_handle, WM8741_REG_MODE_CTRL2, mode2);

    wm8741_write_reg(dev_handle, WM8741_REG_FILTER_CTRL, 0x00);
    wm8741_write_reg(dev_handle, WM8741_REG_VOLUME_CTRL, 0x00);
    wm8741_set_attenuation(0);
    ESP_LOGI(TAG, "WM8741 configured.");
}

/* ==================== 主函数 ==================== */
void app_main(void)
{
    // NVS is required by the Bluetooth controller/Bluedroid stack even when
    // Wi-Fi is disabled.
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // I2C
    i2c_master_bus_config_t bus_config = {
        .i2c_port = I2C_MASTER_NUM,
        .sda_io_num = I2C_MASTER_SDA_IO,
        .scl_io_num = I2C_MASTER_SCL_IO,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    ESP_ERROR_CHECK(i2c_new_master_bus(&bus_config, &bus_handle));

    i2c_device_config_t dev_config = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = WM8741_I2C_ADDR,
        .scl_speed_hz = I2C_MASTER_FREQ_HZ,
    };
    ESP_ERROR_CHECK(i2c_master_bus_add_device(bus_handle, &dev_config, &dev_handle));

    memset(wm8741_regs, 0, sizeof(wm8741_regs));
    wm8741_init();

    // 启动 BLE GATT 服务器
    ESP_ERROR_CHECK(ble_gatt_server_start());

    ESP_LOGI(TAG, "System ready. BLE GATT server name: WM8741_DAC");

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
