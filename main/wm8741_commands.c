/*
 * SPDX-FileCopyrightText: 2024 Espressif Systems (Shanghai) CO LTD
 * SPDX-License-Identifier: Unlicense OR CC0-1.0
 *
 * WM8741 command parser used by the BLE GATT server.
 */

#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include "wm8741_commands.h"
#include "driver/i2c_master.h"

/* Externs from i2c_basic_example_main.c */
extern uint8_t wm8741_regs[0x80];
extern i2c_master_dev_handle_t dev_handle;

extern esp_err_t wm8741_write_reg(i2c_master_dev_handle_t dev, uint8_t reg, uint8_t data);
extern esp_err_t wm8741_update_reg_bit(uint8_t reg, uint8_t bit_mask, uint8_t bit_value);
extern void wm8741_set_attenuation(uint16_t att_value);

esp_err_t wm8741_handle_command(const char *cmd, char *response, size_t response_len)
{
    esp_err_t ret;
    unsigned int reg, val;
    char cmd_lower[128];

    if (cmd == NULL || response == NULL || response_len == 0) {
        return ESP_ERR_INVALID_ARG;
    }

    strncpy(cmd_lower, cmd, sizeof(cmd_lower) - 1);
    cmd_lower[sizeof(cmd_lower) - 1] = '\0';
    for (int i = 0; cmd_lower[i]; i++) {
        cmd_lower[i] = (char)tolower((unsigned char)cmd_lower[i]);
    }

    response[0] = '\0';

    if (strncmp(cmd_lower, "reset", 5) == 0) {
        ret = wm8741_write_reg(dev_handle, WM8741_REG_SOFT_RESET, 0x00);
        if (ret == ESP_OK) {
            snprintf(response, response_len, "OK Reset\n");
        } else {
            snprintf(response, response_len, "ERR Reset failed: %d\n", ret);
        }
    }
    else if (strncmp(cmd_lower, "mute", 4) == 0) {
        int on;
        if (sscanf(cmd, "MUTE %d", &on) == 1 && (on == 0 || on == 1)) {
            ret = wm8741_update_reg_bit(WM8741_REG_VOLUME_CTRL, VOL_SOFTMUTE, on);
            if (ret == ESP_OK) {
                snprintf(response, response_len, "OK MUTE %s\n", on ? "ON" : "OFF");
            } else {
                snprintf(response, response_len, "ERR MUTE failed: %d\n", ret);
            }
        } else {
            snprintf(response, response_len, "ERR Use: MUTE 0/1\n");
        }
    }
    else if (strncmp(cmd_lower, "volume", 6) == 0) {
        int steps;
        if (sscanf(cmd, "VOLUME %d", &steps) == 1) {
            if (steps < 0) steps = 0;
            if (steps > 127) steps = 127;
            wm8741_set_attenuation((uint16_t)steps);
            snprintf(response, response_len, "OK Volume %d steps (%.2fdB)\n", steps, steps * 0.125);
        } else {
            snprintf(response, response_len, "ERR Use: VOLUME 0-127\n");
        }
    }
    else if (strncmp(cmd_lower, "atten", 5) == 0) {
        int att;
        if (sscanf(cmd, "ATTEN %d", &att) == 1 && att >= 0 && att <= 1023) {
            wm8741_set_attenuation((uint16_t)att);
            snprintf(response, response_len, "OK Atten %d (%.2fdB)\n", att, att * 0.125);
        } else {
            snprintf(response, response_len, "ERR Use: ATTEN 0-1023\n");
        }
    }
    else if (strncmp(cmd_lower, "filter", 6) == 0) {
        int resp;
        if (sscanf(cmd, "FILTER %d", &resp) == 1 && resp >= 1 && resp <= 5) {
            uint8_t current = wm8741_regs[WM8741_REG_FILTER_CTRL];
            current = (current & ~FILT_FIRSEL_MASK) | ((resp - 1) & 0x07);
            ret = wm8741_write_reg(dev_handle, WM8741_REG_FILTER_CTRL, current);
            if (ret == ESP_OK) {
                snprintf(response, response_len, "OK Filter %d\n", resp);
            } else {
                snprintf(response, response_len, "ERR Filter failed: %d\n", ret);
            }
        } else {
            snprintf(response, response_len, "ERR Use: FILTER 1-5\n");
        }
    }
    else if (strncmp(cmd_lower, "deemph", 6) == 0) {
        int mode;
        if (sscanf(cmd, "DEEMPH %d", &mode) == 1 && mode >= 0 && mode <= 3) {
            uint8_t current = wm8741_regs[WM8741_REG_FILTER_CTRL];
            current = (current & ~FILT_DEEMPH_MASK) | ((mode << FILT_DEEMPH_SHIFT) & FILT_DEEMPH_MASK);
            ret = wm8741_write_reg(dev_handle, WM8741_REG_FILTER_CTRL, current);
            if (ret == ESP_OK) {
                snprintf(response, response_len, "OK De-emph %d\n", mode);
            } else {
                snprintf(response, response_len, "ERR De-emph failed: %d\n", ret);
            }
        } else {
            snprintf(response, response_len, "ERR Use: DEEMPH 0-3\n");
        }
    }
    else if (strncmp(cmd_lower, "anticlip", 8) == 0) {
        int enable;
        if (sscanf(cmd, "ANTICLIP %d", &enable) == 1 && (enable == 0 || enable == 1)) {
            ret = wm8741_update_reg_bit(WM8741_REG_VOLUME_CTRL, VOL_ATT2DB, enable);
            if (ret == ESP_OK) {
                snprintf(response, response_len, "OK Anti-clip %s\n", enable ? "ON" : "OFF");
            } else {
                snprintf(response, response_len, "ERR Anti-clip failed: %d\n", ret);
            }
        } else {
            snprintf(response, response_len, "ERR Use: ANTICLIP 0/1\n");
        }
    }
    else if (strncmp(cmd_lower, "set_reg", 7) == 0) {
        if (sscanf(cmd, "SET_REG %x %x", &reg, &val) == 2) {
            if (reg <= 0x7F && val <= 0xFF) {
                ret = wm8741_write_reg(dev_handle, (uint8_t)reg, (uint8_t)val);
                if (ret == ESP_OK) {
                    snprintf(response, response_len, "OK Reg 0x%02X=0x%02X\n", reg, val);
                } else {
                    snprintf(response, response_len, "ERR Write reg 0x%02X failed: %d\n", reg, ret);
                }
            } else {
                snprintf(response, response_len, "ERR Reg/Val out of range\n");
            }
        } else {
            snprintf(response, response_len, "ERR Use: SET_REG <hex_reg> <hex_val>\n");
        }
    }
    else {
        snprintf(response, response_len, "ERR Unknown command\n");
    }

    return ESP_OK;
}
