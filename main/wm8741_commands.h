#ifndef WM8741_COMMANDS_H
#define WM8741_COMMANDS_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"
#include "driver/i2c_master.h"

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

/* 双单声道（dual mono / bridged）软件配置，写 MODE_CTRL2 (R8)：
 * 默认值 0x02 = 立体声；0x06 = 左声道 mono（DIFF=1）；0x0E = 右声道 mono（DIFF=1, LRSEL=1）
 * 配合硬件：DIFFHW(6脚)=GND，VOUTLP(17)+VOUTRN(13)、VOUTRP(12)+VOUTLN(16) 桥接成差分输出 */
#define MODE2_MONO_LEFT     0x06
#define MODE2_MONO_RIGHT    0x0E

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

/* ==================== 跨模块共享的底层接口 ==================== */
/* 以下符号定义于 i2c_basic_example_main.c，供 wm8741_commands.c 调用。 */

/* 影子寄存器：维护 WM8741 各寄存器的最新写入值 */
extern uint8_t wm8741_regs[0x80];

/* 左右声道的 I2C 设备句柄 */
extern i2c_master_dev_handle_t dev_handle_left;
extern i2c_master_dev_handle_t dev_handle_right;

/* 向指定设备写入一个寄存器 */
esp_err_t wm8741_write_reg(i2c_master_dev_handle_t dev, uint8_t reg, uint8_t data);

/* 安全修改寄存器特定位（单通道 / 双通道） */
esp_err_t wm8741_update_reg_bit_ch(wm8741_channel_t ch, uint8_t reg, uint8_t bit_mask, uint8_t bit_value);
esp_err_t wm8741_update_reg_bit(uint8_t reg, uint8_t bit_mask, uint8_t bit_value);

/* 设置 DAC 衰减（单通道 / 双通道） */
esp_err_t wm8741_set_attenuation_ch(wm8741_channel_t ch, uint16_t att_value);
void wm8741_set_attenuation(uint16_t att_value);

/* 切换 MCLK 晶体（true = 22 MHz，false = 24 MHz） */
esp_err_t wm8741_set_mclk_freq(bool use_22mhz);

/* 全芯片静音 / 解除静音 */
esp_err_t wm8741_mute_all(void);
esp_err_t wm8741_unmute_all(void);

/* 单芯片完整初始化（软复位后恢复 mono 差分模式、格式、滤波器等） */
esp_err_t wm8741_init_chip(i2c_master_dev_handle_t dev, const char *label);

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
