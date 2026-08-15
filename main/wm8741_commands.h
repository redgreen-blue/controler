#ifndef WM8741_COMMANDS_H
#define WM8741_COMMANDS_H

#include <stddef.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ==================== WM8741 I2C 地址 ==================== */
#define WM8741_I2C_ADDR_LEFT        0x1A    /* CSB = GND */
#define WM8741_I2C_ADDR_RIGHT       0x1B    /* CSB = VDD */

/* 兼容性别名：旧地址保留 */
#define WM8741_I2C_ADDR             WM8741_I2C_ADDR_LEFT

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
#define FMT_IWL_16          0
#define FMT_IWL_20          1
#define FMT_IWL_24          2
#define FMT_IWL_32          3
#define FMT_FMT_SHIFT       2
#define FMT_RJ              0
#define FMT_LJ              1
#define FMT_I2S             2
#define FMT_DSP             3
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
 * @brief Channel target for dual-WM8741 configurations.
 *
 * Left and right DAC chips share the same I2C bus but have different
 * addresses (CSB pin strapping).
 */
typedef enum {
    WM8741_CH_LEFT = 0,
    WM8741_CH_RIGHT,
    WM8741_CH_BOTH
} wm8741_channel_t;

/**
 * @brief Parse and execute a WM8741 control command.
 *
 * Supported commands:
 *   RESET [L/R/BOTH]
 *   MUTE [L/R/BOTH] 0/1
 *   VOLUME [L/R/BOTH] 0-127
 *   ATTEN [L/R/BOTH] 0-1023
 *   FILTER [L/R/BOTH] 1-5
 *   FORMAT [L/R/BOTH] <fmt 0=RJ 1=LJ 2=I2S 3=DSP> <iwl 0=16 1=20 2=24 3=32>
 *   MCLK 22|24
 *   SRATE 32|44.1|48|88.2|96|176.4|192
 *   DEEMPH [L/R/BOTH] 0-3
 *   ANTICLIP [L/R/BOTH] 0/1
 *   SET_REG [L/R/BOTH] <hex_reg> <hex_val>
 *
 * When the channel argument is omitted, BOTH is assumed for backwards
 * compatibility.
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
