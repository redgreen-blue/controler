# WM8741 Web Bluetooth 库

本目录包含用于控制 ESP32 + WM8741 DAC 的 Web Bluetooth TypeScript 库。

## 功能特性

- **设备发现与连接管理**：基于 Web Bluetooth API 扫描、配对、连接状态监控；
- **GATT 服务与特征值操作**：服务发现、特征值读写、通知订阅；
- **数据通信处理**：文本命令编码/解码、响应超时、命令队列；
- **连接状态维护**：有限状态机、意外断开自动重连、指数退避重试；
- **完整错误处理**：统一错误类型与状态反馈；
- **可测试**：内置 Web Bluetooth Mock，支持单元测试与集成测试。

## 目录结构

```text
web/
├── src/               # TypeScript 源码
├── tests/             # 单元测试与集成测试
├── examples/          # 示例页面
├── docs/              # 文档
├── scripts/           # 构建辅助脚本
└── dist/              # 构建产物
```

## 快速开始

### 安装依赖

```bash
cd web
npm install
```

### 运行测试

```bash
npm run test
```

### 构建库

```bash
npm run build
```

构建后会生成：

- `dist/wm8741-ble.umd.js` — 可直接通过 `<script>` 标签引入；
- `dist/wm8741-ble.esm.js` — ES Module 格式，供现代构建工具使用；
- `dist/index.d.ts` — TypeScript 类型声明。

### 部署到 GitHub Pages（推荐）

本项目已配置 GitHub Actions，可将控制页面自动部署到 GitHub Pages：

1. 将整个 `test2` 仓库推送到 GitHub；
2. 在仓库 **Settings → Pages** 中，选择 **Source: GitHub Actions**；
3. 向 `main` 分支推送代码，或手动触发 `.github/workflows/deploy.yml`；
4. 部署完成后，访问 `https://<username>.github.io/<repo>/` 即可使用。

该页面通过 HTTPS 加载，满足 Web Bluetooth 的安全上下文要求，用户打开页面后点击“连接设备”即可通过蓝牙直连 ESP32，无需 ESP32 提供 WiFi/HTTP。

### 本地开发示例

```bash
cd web
npm run build
```

然后用浏览器打开 `examples/wm8741-controller.html`。注意：本地直接打开 HTML 文件可能因安全上下文限制无法使用 Web Bluetooth，建议通过本地 HTTPS 服务器或 `localhost` 访问。

### 嵌入 ESP32 固件（旧方案，已移除）

~~`npm run embed`~~ 原用于将 JS bundle 转换为 C 字符串并由 ESP32 HTTP server 提供。由于 Web Bluetooth 要求 HTTPS，ESP32 HTTP 方案已被移除。控制页面现由 GitHub Pages 托管，ESP32 端仅保留 BLE GATT Server + I2C 控制，固件体积从约 1.4 MB 降至约 760 KB。

## 浏览器兼容性

Web Bluetooth API 目前主要在 Chromium 内核浏览器（Chrome、Edge、Opera）的桌面与 Android 版本中受支持。

- 必须使用 HTTPS 或 `localhost`（安全上下文要求）；
- `requestDevice()` 必须由用户手势（如点击按钮）触发；
- 不支持 Safari 和 Firefox。

## 文档

- [API 参考](./docs/API.md)
- [使用指南](./docs/USAGE.md)
- [示例页面](./examples/wm8741-controller.html)

## 许可证

MIT
