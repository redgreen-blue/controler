# WM8741 BLE 控制器

基于 ESP32-C3 + Web Bluetooth 的 WM8741 DAC 无线控制方案。

## 架构

```text
┌─────────────────┐      HTTPS       ┌─────────────────┐      BLE       ┌─────────────┐
│  Edge/Chrome    │ ◄─────────────── │  GitHub Pages   │ ◄────────────► │   ESP32-C3  │
│  (Web Bluetooth)│   加载控制页面    │  (web/index.html)│   GATT Server  │  + WM8741   │
└─────────────────┘                  └─────────────────┘                └─────────────┘
```

- **前端页面**：托管在 GitHub Pages（HTTPS），使用 Web Bluetooth API 扫描、连接、控制设备。
- **ESP32 固件**：仅保留 BLE GATT Server + I2C 驱动，通过蓝牙接收文本命令并操作 WM8741 寄存器。
- **不再使用**：Wi-Fi、HTTP Server、TCP/UDP 命令接口、ESP32 本地托管页面。

## 快速开始

### 1. 部署前端页面

```bash
cd web
npm install
npm run build
```

将仓库推送到 GitHub，并在仓库 **Settings → Pages** 中启用 **GitHub Actions** 源。部署后访问：

```text
https://<username>.github.io/<repo>/
```

### 2. 编译并烧录 ESP32 固件

```bash
idf.py build
idf.py -p PORT flash monitor
```

固件默认使用 `partitions_singleapp_large.csv`，因为启用 Bluedroid 后 app 体积较大。

### 3. 使用

1. 确保 ESP32 已上电，蓝牙已开启。
2. 用 Edge/Chrome 打开 GitHub Pages 地址。
3. 点击 **连接设备**，选择名为 `WM8741_DAC` 的蓝牙设备。
4. 通过页面调节音量、滤波器、静音等参数。

## 项目结构

```text
test2/
├── main/
│   ├── i2c_basic_example_main.c   # 主程序：I2C + BLE GATT Server
│   ├── ble_gatt_server.c          # BLE GATT Server 实现
│   ├── wm8741_commands.c/h        # 命令解析与 WM8741 寄存器操作
│   └── CMakeLists.txt             # 组件配置
├── web/
│   ├── src/                       # Web Bluetooth TypeScript 库
│   ├── index.html                 # GitHub Pages 入口
│   ├── examples/                  # 本地开发示例
│   └── README.md                  # 前端详细文档
├── .github/workflows/deploy.yml   # GitHub Pages 自动部署
└── sdkconfig                      # ESP-IDF 配置（蓝牙、I2C、大分区表）
```

## 浏览器兼容性

Web Bluetooth API 目前仅在 Chromium 内核浏览器（Chrome、Edge、Opera）的桌面与 Android 版本中受支持。

- 必须使用 HTTPS 或 `localhost`；
- `requestDevice()` 必须由用户手势触发；
- 不支持 Safari 和 Firefox。

## 测试

前端测试：

```bash
cd web
npm run test
```

## 许可证

MIT
