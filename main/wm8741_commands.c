/*
 * SPDX-FileCopyrightText: 2024 Espressif Systems (Shanghai) CO LTD
 * SPDX-License-Identifier: Unlicense OR CC0-1.0
 *
 * WM8741 command parser used by the BLE GATT server.
 *
 * The firmware now supports dual mono WM8741 configuration. Commands may
 * target LEFT (0x1A), RIGHT (0x1B) or BOTH channels. When omitted, BOTH
 * is assumed for backwards compatibility.
 */

#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "wm8741_commands.h"
#include "driver/i2c_master.h"

/* ==================== 静音保护辅助 ==================== */

/**
 * @brief Mute both DACs before a critical switch, remembering the previous
 *        mute state so it can be restored afterwards.
 */
static esp_err_t mute_begin(bool *was_muted)
{
    *was_muted = (wm8741_regs[0][WM8741_REG_VOLUME_CTRL] & VOL_SOFTMUTE) != 0;
    return wm8741_mute_all();
}

/**
 * @brief Restore the previous mute state after a critical switch.
 */
static void mute_end(bool was_muted)
{
    if (!was_muted) {
        wm8741_unmute_all();
    }
}

/* ==================== Channel helpers ==================== */

static i2c_master_dev_handle_t dev_for_channel(wm8741_channel_t ch)
{
    if (ch == WM8741_CH_RIGHT) {
        return dev_handle_right;
    }
    return dev_handle_left;
}

static const char *channel_name(wm8741_channel_t ch)
{
    switch (ch) {
        case WM8741_CH_LEFT:  return "LEFT";
        case WM8741_CH_RIGHT: return "RIGHT";
        default:              return "BOTH";
    }
}

static int starts_with_word(const char *s, const char *word)
{
    size_t len = strlen(word);
    if (strncasecmp(s, word, len) != 0) {
        return 0;
    }
    /* Next char must be space or end of string */
    char next = s[len];
    return next == '\0' || next == ' ' || next == '\t' || next == '\n' || next == '\r';
}

/**
 * @brief Parse optional channel specifier at the beginning of args.
 *
 * If a channel is found, *args is advanced past it. Otherwise *args is
 * unchanged and WM8741_CH_BOTH is returned.
 */
static wm8741_channel_t parse_channel(const char **args)
{
    const char *p = *args;
    while (*p == ' ' || *p == '\t') p++;

    wm8741_channel_t ch = WM8741_CH_BOTH;
    int consumed = 0;

    if (starts_with_word(p, "left") || starts_with_word(p, "l")) {
        ch = WM8741_CH_LEFT;
        consumed = starts_with_word(p, "left") ? 4 : 1;
    } else if (starts_with_word(p, "right") || starts_with_word(p, "r")) {
        ch = WM8741_CH_RIGHT;
        consumed = starts_with_word(p, "right") ? 5 : 1;
    } else if (starts_with_word(p, "both") || starts_with_word(p, "b")) {
        ch = WM8741_CH_BOTH;
        consumed = starts_with_word(p, "both") ? 4 : 1;
    }

    if (consumed > 0) {
        p += consumed;
        while (*p == ' ' || *p == '\t') p++;
        *args = p;
    }

    return ch;
}

/* ==================== Command handlers ==================== */

static esp_err_t cmd_reset(wm8741_channel_t ch, const char *args, char *response, size_t response_len)
{
    (void)args;
    esp_err_t ret;

    /* 软复位会清除全部寄存器（R8 回到立体声默认值），因此复位后必须重新
     * 执行完整初始化，恢复 mono 差分模式、格式、滤波器等配置，否则桥接
     * 输出级会再次互相灌电流导致发热 */
    if (ch == WM8741_CH_BOTH) {
        ret = wm8741_init_chip(dev_handle_left, "WM8741 Left");
        if (ret != ESP_OK) goto fail;
        ret = wm8741_init_chip(dev_handle_right, "WM8741 Right");
        if (ret != ESP_OK) goto fail;
    } else {
        ret = wm8741_init_chip(dev_for_channel(ch), channel_name(ch));
        if (ret != ESP_OK) goto fail;
    }

    snprintf(response, response_len, "OK Reset %s\n", channel_name(ch));
    return ESP_OK;

fail:
    snprintf(response, response_len, "ERR Reset %s failed: %d\n", channel_name(ch), ret);
    return ESP_OK;
}

static esp_err_t cmd_mute(wm8741_channel_t ch, const char *args, char *response, size_t response_len)
{
    int on;
    if (sscanf(args, "%d", &on) != 1 || (on != 0 && on != 1)) {
        snprintf(response, response_len, "ERR Use: MUTE [L/R/BOTH] 0/1\n");
        return ESP_OK;
    }

    esp_err_t ret;
    if (ch == WM8741_CH_BOTH) {
        ret = wm8741_update_reg_bit(WM8741_REG_VOLUME_CTRL, VOL_SOFTMUTE, on);
    } else {
        ret = wm8741_update_reg_bit_ch(ch, WM8741_REG_VOLUME_CTRL, VOL_SOFTMUTE, on);
    }

    if (ret == ESP_OK) {
        snprintf(response, response_len, "OK MUTE %s %s\n", channel_name(ch), on ? "ON" : "OFF");
    } else {
        snprintf(response, response_len, "ERR MUTE %s failed: %d\n", channel_name(ch), ret);
    }
    return ESP_OK;
}

static esp_err_t cmd_volume(wm8741_channel_t ch, const char *args, char *response, size_t response_len)
{
    int steps;
    if (sscanf(args, "%d", &steps) != 1) {
        snprintf(response, response_len, "ERR Use: VOLUME [L/R/BOTH] 0-127\n");
        return ESP_OK;
    }
    if (steps < 0) steps = 0;
    if (steps > 127) steps = 127;

    esp_err_t ret_left = ESP_OK;
    esp_err_t ret_right = ESP_OK;

    if (ch == WM8741_CH_BOTH || ch == WM8741_CH_LEFT) {
        ret_left = wm8741_set_attenuation_ch(WM8741_CH_LEFT, (uint16_t)steps);
    }
    if (ch == WM8741_CH_BOTH || ch == WM8741_CH_RIGHT) {
        ret_right = wm8741_set_attenuation_ch(WM8741_CH_RIGHT, (uint16_t)steps);
    }

    if (ret_left == ESP_OK && ret_right == ESP_OK) {
        snprintf(response, response_len, "OK Volume %s %d steps (%.2fdB)\n",
                 channel_name(ch), steps, steps * 0.125);
    } else {
        snprintf(response, response_len, "ERR Volume %s failed: L=%d R=%d\n",
                 channel_name(ch), ret_left, ret_right);
    }
    return ESP_OK;
}

static esp_err_t cmd_atten(wm8741_channel_t ch, const char *args, char *response, size_t response_len)
{
    int att;
    if (sscanf(args, "%d", &att) != 1) {
        snprintf(response, response_len, "ERR Use: ATTEN [L/R/BOTH] 0-1023\n");
        return ESP_OK;
    }
    if (att < 0) att = 0;
    if (att > 1023) att = 1023;

    esp_err_t ret_left = ESP_OK;
    esp_err_t ret_right = ESP_OK;

    if (ch == WM8741_CH_BOTH || ch == WM8741_CH_LEFT) {
        ret_left = wm8741_set_attenuation_ch(WM8741_CH_LEFT, (uint16_t)att);
    }
    if (ch == WM8741_CH_BOTH || ch == WM8741_CH_RIGHT) {
        ret_right = wm8741_set_attenuation_ch(WM8741_CH_RIGHT, (uint16_t)att);
    }

    if (ret_left == ESP_OK && ret_right == ESP_OK) {
        snprintf(response, response_len, "OK Atten %s %d (%.2fdB)\n",
                 channel_name(ch), att, att * 0.125);
    } else {
        snprintf(response, response_len, "ERR Atten %s failed: L=%d R=%d\n",
                 channel_name(ch), ret_left, ret_right);
    }
    return ESP_OK;
}

static esp_err_t cmd_filter(wm8741_channel_t ch, const char *args, char *response, size_t response_len)
{
    int resp;
    if (sscanf(args, "%d", &resp) != 1 || resp < 1 || resp > 5) {
        snprintf(response, response_len, "ERR Use: FILTER [L/R/BOTH] 1-5\n");
        return ESP_OK;
    }

    uint8_t new_val = (uint8_t)((resp - 1) & 0x07);
    esp_err_t ret;

    if (ch == WM8741_CH_BOTH) {
        uint8_t current_left = wm8741_regs[0][WM8741_REG_FILTER_CTRL];
        current_left = (current_left & ~FILT_FIRSEL_MASK) | new_val;
        ret = wm8741_write_reg(dev_handle_left, WM8741_REG_FILTER_CTRL, current_left);
        if (ret != ESP_OK) goto fail;

        uint8_t current_right = wm8741_regs[1][WM8741_REG_FILTER_CTRL];
        current_right = (current_right & ~FILT_FIRSEL_MASK) | new_val;
        ret = wm8741_write_reg(dev_handle_right, WM8741_REG_FILTER_CTRL, current_right);
        if (ret != ESP_OK) goto fail;
    } else {
        i2c_master_dev_handle_t dev = dev_for_channel(ch);
        int idx = (ch == WM8741_CH_RIGHT) ? 1 : 0;
        uint8_t current = wm8741_regs[idx][WM8741_REG_FILTER_CTRL];
        current = (current & ~FILT_FIRSEL_MASK) | new_val;
        ret = wm8741_write_reg(dev, WM8741_REG_FILTER_CTRL, current);
        if (ret != ESP_OK) goto fail;
    }

    snprintf(response, response_len, "OK Filter %s %d\n", channel_name(ch), resp);
    return ESP_OK;

fail:
    snprintf(response, response_len, "ERR Filter %s failed: %d\n", channel_name(ch), ret);
    return ESP_OK;
}

static esp_err_t cmd_deemph(wm8741_channel_t ch, const char *args, char *response, size_t response_len)
{
    int mode;
    if (sscanf(args, "%d", &mode) != 1 || mode < 0 || mode > 3) {
        snprintf(response, response_len, "ERR Use: DEEMPH [L/R/BOTH] 0-3\n");
        return ESP_OK;
    }

    uint8_t new_val = (uint8_t)((mode << FILT_DEEMPH_SHIFT) & FILT_DEEMPH_MASK);
    esp_err_t ret;

    if (ch == WM8741_CH_BOTH) {
        uint8_t current_left = wm8741_regs[0][WM8741_REG_FILTER_CTRL];
        current_left = (current_left & ~FILT_DEEMPH_MASK) | new_val;
        ret = wm8741_write_reg(dev_handle_left, WM8741_REG_FILTER_CTRL, current_left);
        if (ret != ESP_OK) goto fail;

        uint8_t current_right = wm8741_regs[1][WM8741_REG_FILTER_CTRL];
        current_right = (current_right & ~FILT_DEEMPH_MASK) | new_val;
        ret = wm8741_write_reg(dev_handle_right, WM8741_REG_FILTER_CTRL, current_right);
        if (ret != ESP_OK) goto fail;
    } else {
        i2c_master_dev_handle_t dev = dev_for_channel(ch);
        int idx = (ch == WM8741_CH_RIGHT) ? 1 : 0;
        uint8_t current = wm8741_regs[idx][WM8741_REG_FILTER_CTRL];
        current = (current & ~FILT_DEEMPH_MASK) | new_val;
        ret = wm8741_write_reg(dev, WM8741_REG_FILTER_CTRL, current);
        if (ret != ESP_OK) goto fail;
    }

    snprintf(response, response_len, "OK De-emph %s %d\n", channel_name(ch), mode);
    return ESP_OK;

fail:
    snprintf(response, response_len, "ERR De-emph %s failed: %d\n", channel_name(ch), ret);
    return ESP_OK;
}

static esp_err_t cmd_anticlip(wm8741_channel_t ch, const char *args, char *response, size_t response_len)
{
    int enable;
    if (sscanf(args, "%d", &enable) != 1 || (enable != 0 && enable != 1)) {
        snprintf(response, response_len, "ERR Use: ANTICLIP [L/R/BOTH] 0/1\n");
        return ESP_OK;
    }

    esp_err_t ret;
    if (ch == WM8741_CH_BOTH) {
        ret = wm8741_update_reg_bit(WM8741_REG_VOLUME_CTRL, VOL_ATT2DB, enable);
    } else {
        ret = wm8741_update_reg_bit_ch(ch, WM8741_REG_VOLUME_CTRL, VOL_ATT2DB, enable);
    }

    if (ret == ESP_OK) {
        snprintf(response, response_len, "OK Anti-clip %s %s\n", channel_name(ch), enable ? "ON" : "OFF");
    } else {
        snprintf(response, response_len, "ERR Anti-clip %s failed: %d\n", channel_name(ch), ret);
    }
    return ESP_OK;
}

static esp_err_t cmd_format(wm8741_channel_t ch, const char *args, char *response, size_t response_len)
{
    int fmt, iwl;
    if (sscanf(args, "%d %d", &fmt, &iwl) != 2 ||
        fmt < 0 || fmt > 3 || iwl < 0 || iwl > 3) {
        snprintf(response, response_len,
                 "ERR Use: FORMAT [L/R/BOTH] <fmt 0=RJ 1=LJ 2=I2S 3=DSP> <iwl 0=16 1=20 2=24 3=32>\n");
        return ESP_OK;
    }

    /* 仅改写 IWL 与 FMT 字段，保留 LRP/BCP/REV/PWDN 等其他位 */
    uint8_t new_val = (uint8_t)((iwl << FMT_IWL_SHIFT) | (fmt << FMT_FMT_SHIFT));
    const uint8_t format_mask = (uint8_t)((0x03 << FMT_IWL_SHIFT) | (0x03 << FMT_FMT_SHIFT));
    esp_err_t ret;

    /* 输入格式切换前先静音，避免切换瞬间输出毛刺 */
    bool was_muted;
    ret = mute_begin(&was_muted);
    if (ret != ESP_OK) goto fail;
    vTaskDelay(pdMS_TO_TICKS(20));

    if (ch == WM8741_CH_BOTH) {
        uint8_t current_left = (uint8_t)((wm8741_regs[0][WM8741_REG_FORMAT_CTRL] & ~format_mask) | new_val);
        ret = wm8741_write_reg(dev_handle_left, WM8741_REG_FORMAT_CTRL, current_left);
        if (ret != ESP_OK) goto fail_unmute;

        uint8_t current_right = (uint8_t)((wm8741_regs[1][WM8741_REG_FORMAT_CTRL] & ~format_mask) | new_val);
        ret = wm8741_write_reg(dev_handle_right, WM8741_REG_FORMAT_CTRL, current_right);
        if (ret != ESP_OK) goto fail_unmute;
    } else {
        i2c_master_dev_handle_t dev = dev_for_channel(ch);
        int idx = (ch == WM8741_CH_RIGHT) ? 1 : 0;
        uint8_t current = (uint8_t)((wm8741_regs[idx][WM8741_REG_FORMAT_CTRL] & ~format_mask) | new_val);
        ret = wm8741_write_reg(dev, WM8741_REG_FORMAT_CTRL, current);
        if (ret != ESP_OK) goto fail_unmute;
    }

    vTaskDelay(pdMS_TO_TICKS(20));
    mute_end(was_muted);

    snprintf(response, response_len, "OK Format %s %d %d\n", channel_name(ch), fmt, iwl);
    return ESP_OK;

fail_unmute:
    mute_end(was_muted);
fail:
    snprintf(response, response_len, "ERR Format %s failed: %d\n", channel_name(ch), ret);
    return ESP_OK;
}

static esp_err_t cmd_set_reg(wm8741_channel_t ch, const char *args, char *response, size_t response_len)
{
    unsigned int reg, val;
    if (sscanf(args, "%x %x", &reg, &val) != 2 || reg > 0x7F || val > 0xFF) {
        snprintf(response, response_len, "ERR Use: SET_REG [L/R/BOTH] <hex_reg> <hex_val>\n");
        return ESP_OK;
    }

    esp_err_t ret;
    if (ch == WM8741_CH_BOTH) {
        ret = wm8741_write_reg(dev_handle_left, (uint8_t)reg, (uint8_t)val);
        if (ret != ESP_OK) goto fail;
        ret = wm8741_write_reg(dev_handle_right, (uint8_t)reg, (uint8_t)val);
        if (ret != ESP_OK) goto fail;
    } else {
        ret = wm8741_write_reg(dev_for_channel(ch), (uint8_t)reg, (uint8_t)val);
        if (ret != ESP_OK) goto fail;
    }

    snprintf(response, response_len, "OK Reg %s 0x%02X=0x%02X\n", channel_name(ch), reg, val);
    return ESP_OK;

fail:
    snprintf(response, response_len, "ERR Write reg %s 0x%02X failed: %d\n", channel_name(ch), reg, ret);
    return ESP_OK;
}

/* ==================== Command dispatcher ==================== */

esp_err_t wm8741_handle_command(const char *cmd, char *response, size_t response_len)
{
    char cmd_lower[128];
    const char *args;
    esp_err_t ret = ESP_OK;

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
        args = cmd + 5;
        wm8741_channel_t ch = parse_channel(&args);
        ret = cmd_reset(ch, args, response, response_len);
    }
    else if (strncmp(cmd_lower, "mute", 4) == 0) {
        args = cmd + 4;
        wm8741_channel_t ch = parse_channel(&args);
        ret = cmd_mute(ch, args, response, response_len);
    }
    else if (strncmp(cmd_lower, "volume", 6) == 0) {
        args = cmd + 6;
        wm8741_channel_t ch = parse_channel(&args);
        ret = cmd_volume(ch, args, response, response_len);
    }
    else if (strncmp(cmd_lower, "atten", 5) == 0) {
        args = cmd + 5;
        wm8741_channel_t ch = parse_channel(&args);
        ret = cmd_atten(ch, args, response, response_len);
    }
    else if (strncmp(cmd_lower, "filter", 6) == 0) {
        args = cmd + 6;
        wm8741_channel_t ch = parse_channel(&args);
        ret = cmd_filter(ch, args, response, response_len);
    }
    else if (strncmp(cmd_lower, "format", 6) == 0) {
        args = cmd + 6;
        wm8741_channel_t ch = parse_channel(&args);
        ret = cmd_format(ch, args, response, response_len);
    }
    else if (strncmp(cmd_lower, "deemph", 6) == 0) {
        args = cmd + 6;
        wm8741_channel_t ch = parse_channel(&args);
        ret = cmd_deemph(ch, args, response, response_len);
    }
    else if (strncmp(cmd_lower, "anticlip", 8) == 0) {
        args = cmd + 8;
        wm8741_channel_t ch = parse_channel(&args);
        ret = cmd_anticlip(ch, args, response, response_len);
    }
    else if (strncmp(cmd_lower, "set_reg", 7) == 0) {
        args = cmd + 7;
        wm8741_channel_t ch = parse_channel(&args);
        ret = cmd_set_reg(ch, args, response, response_len);
    }
    else {
        snprintf(response, response_len, "ERR Unknown command\n");
    }

    /* 在每条命令响应后附加左右芯片寄存器状态 */
    wm8741_append_regs_state(response, response_len);

    return ret;
}
