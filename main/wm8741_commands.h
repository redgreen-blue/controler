#ifndef WM8741_COMMANDS_H
#define WM8741_COMMANDS_H

#include <stddef.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ==================== WM8741 寄存器定义 ==================== */
#define WM8741_I2C_ADDR             0x1A

#define WM8741_REG_DACL_LSB         0x00
#define WM8741_REG_DACL_MSB         0x01
#define WM8741_REG_DACR_LSB         0x02
#define WM8741_REG_DACR_MSB         0x03
#define WM8741_REG_VOLUME_CTRL      0x04
#define WM8741_REG_FORMAT_CTRL      0x05
#define WM8741_REG_FILTER_CTRL      0x06
#define WM8741_REG_MODE_CTRL1       0x07
#define WM8741_REG_MODE_CTRL2       0x08
#define WM8741_REG_SOFT_RESET       0x09
#define WM8741_REG_ADD_CTRL1        0x20

/* 位定义 */
#define VOL_ATT2DB          (1<<1)
#define VOL_SOFTMUTE        (1<<3)
#define VOL_VOL_RAMP        (1<<0)
#define ATTEN_UPDATE        (1<<5)

#define FMT_IWL_SHIFT       0
#define FMT_IWL_24          2
#define FMT_FMT_SHIFT       2
#define FMT_I2S             2
#define FMT_LRP             (1<<4)
#define FMT_BCP             (1<<5)
#define FMT_REV             (1<<6)
#define FMT_PWDN            (1<<7)

#define FILT_FIRSEL_MASK    0x07
#define FILT_DEEMPH_SHIFT   5
#define FILT_DEEMPH_MASK    0x60

#define MODE_SR_SHIFT       2
#define MODE_OSR_SHIFT      5
#define MODE_MODESEL_MASK   0x03

#define MODE2_DITHER_MASK   0x03
#define MODE2_DIFF_SHIFT    2

/**
 * @brief Parse and execute a WM8741 control command.
 *
 * Supported commands:
 *   RESET
 *   MUTE 0/1
 *   VOLUME 0-127
 *   ATTEN 0-1023
 *   FILTER 1-5
 *   DEEMPH 0-3
 *   ANTICLIP 0/1
 *   SET_REG <hex_reg> <hex_val>
 *   GET_IP
 *
 * @param cmd             Null-terminated command string.
 * @param response        Buffer to write the text response.
 * @param response_len    Size of the response buffer.
 * @return ESP_OK on success, or an error code on failure.
 */
esp_err_t wm8741_handle_command(const char *cmd, char *response, size_t response_len);

#ifdef __cplusplus
}
#endif

#endif /* WM8741_COMMANDS_H */
