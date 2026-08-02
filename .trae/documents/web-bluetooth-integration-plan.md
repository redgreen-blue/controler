# Web Bluetooth 功能集合集成计划

## Context

项目 `d:\ESP\test2` 是一个 ESP-IDF 固件项目，当前通过 I2C 控制 WM8741 DAC，并通过 Wi-Fi 提供 HTTP 控制面板（`main/i2c_basic_example_main.c` 内嵌 `index_html`）。项目根目录下 `main/index.html` 已包含一段面向 WM8741 的 Web Bluetooth 内联脚本，但它存在以下问题：

- 代码与 UI 耦合，没有可复用的蓝牙抽象层；
- 缺少连接状态机、自动重连、超时管理；
- 错误处理零散，无统一错误类型；
- 没有单元测试和集成测试；
- **关键缺口**：固件端目前只实现了 HTTP/TCP/UDP 控制，没有对应的 BLE GATT Server，因此 Web Bluetooth 客户端没有可连接的服务端。

本计划旨在：

1. 在 `web/` 目录构建一个完整、通用、可测试的 TypeScript Web Bluetooth 库；
2. 在固件端新增 NimBLE/Bluedroid GATT Server，复用现有命令处理逻辑；
3. 将构建产物嵌入 C 字符串，由现有 HTTP server 提供；
4. 重写 `main/index.html` 示例，展示如何使用新库；
5. 补充文档与测试，确保各模块正确稳定。

## Recommended Approach

### 1. 前端：TypeScript + Vite + Vitest

在 `web/` 子目录新建 Node 项目，与 ESP-IDF 构建隔离。核心设计如下：

#### 目录结构

```text
web/
├── package.json
├── tsconfig.json
├── vite.config.ts          # Vite lib 模式，输出 UMD/ESM
├── vitest.config.ts        # 单元/集成测试配置
├── src/
│   ├── index.ts            # 对外导出
│   ├── types.ts            # 公共类型
│   ├── constants.ts        # UUID、超时、重试策略
│   ├── errors.ts           # 统一错误类
│   ├── state-machine.ts    # 连接状态机
│   ├── device-manager.ts   # 扫描、配对、断开监听
│   ├── gatt-manager.ts     # GATT connect / service / characteristic / notify
│   ├── protocol.ts         # 文本命令编码、响应解析、数据转换
│   └── wm8741-client.ts    # 面向本项目的 WM8741 高层 API
├── tests/
│   ├── mocks/
│   │   ├── fake-bluetooth.ts
│   │   └── fake-gatt.ts
│   ├── unit/
│   │   ├── state-machine.test.ts
│   │   ├── protocol.test.ts
│   │   ├── gatt-manager.test.ts
│   │   └── wm8741-client.test.ts
│   └── integration/
│       └── wm8741-client.integration.test.ts
├── examples/
│   └── wm8741-controller.html
└── dist/                   # 构建产物（gitignore）
    ├── wm8741-ble.umd.js
    └── wm8741-ble.esm.js
```

#### 核心 API 设计

主入口类 `WM8741BLEClient`：

```typescript
export class WM8741BLEClient extends EventTarget {
  constructor(options?: WM8741BLEClientOptions);

  // 发现与连接
  scan(options?: ScanOptions): Promise<BluetoothDeviceInfo[]>;
  connect(deviceInfo: BluetoothDeviceInfo): Promise<void>;
  disconnect(): Promise<void>;

  // 状态
  get state(): ConnectionState;
  get isConnected(): boolean;

  // WM8741 高层控制
  setVolume(steps: number): Promise<string>;
  setFilter(response: 1 | 2 | 3 | 4 | 5): Promise<string>;
  setMute(enable: boolean): Promise<string>;
  setVolumeRamp(enable: boolean): Promise<string>;
  setAntiClip(enable: boolean): Promise<string>;
  reset(): Promise<string>;
  writeRegister(reg: number, value: number): Promise<string>;

  // 原始命令
  sendCommand(cmd: string, options?: CommandOptions): Promise<string>;
}
```

内部模块：

- `ConnectionStateMachine`：管理 `idle → scanning → connecting → discovering-services → connected → reconnecting → disconnected` 状态，禁止非法状态转移。
- `DeviceManager`：封装 `navigator.bluetooth.requestDevice`，处理用户取消、安全上下文等错误。
- `GATTManager`：封装 `gatt.connect`、service/characteristic 发现、`readValue`、`writeValue`、`startNotifications`/`stopNotifications`。
- `CommandProtocol`：提供 `TextEncoder`/`TextDecoder` 封装、命令队列、响应解析、`DataView`/`Uint8Array`/`hex` 互转。
- 错误类：`BLEError`、`NotSupportedError`、`SecurityError`、`ConnectionTimeoutError`、`GATTError`、`ProtocolError`。

#### 状态机与连接维护

- 监听 `gattserverdisconnected` 事件；
- 自动重连采用指数退避（1s → 2s → 4s → 8s，最大 30s），默认最多 5 次；
- 重连期间状态为 `reconnecting`；
- 用户主动 `disconnect()` 立即取消重连并进入 `disconnected`；
- 所有 GATT 命令通过队列串行执行，避免写冲突；
- 命令响应超时默认 3000ms，可配置。

### 2. 固件端：新增 BLE GATT Server

新增文件：

- `main/ble_gatt_server.h`
- `main/ble_gatt_server.c`

GATT 服务定义（与现有 `main/index.html` 保持一致）：

| 项目 | UUID |
|------|------|
| Service | `12345678-1234-5678-1234-56789abcdef0` |
| CMD Characteristic (Write) | `12345678-1234-5678-1234-56789abcdef1` |
| RESP Characteristic (Notify) | `12345678-1234-5678-1234-56789abcdef2` |

复用现有命令处理逻辑：将 `i2c_basic_example_main.c` 中的 `handle_command()` 提取为 `main/wm8741_commands.c` 中的公共函数：

```c
esp_err_t wm8741_handle_command(const char *cmd, char *response, size_t response_len);
```

使 TCP server、HTTP API、BLE GATT server 共用同一套命令解析与 WM8741 寄存器操作。

BLE GATT Server 在 `app_main()` 中初始化，使用 NimBLE（默认）或 Bluedroid。收到 CMD 特征值写入后调用 `wm8741_handle_command`，再通过 RESP 特征值通知返回结果字符串。

### 3. 构建产物集成到 HTTP Server

1. 在 `web/` 下运行 `npm run build`，生成 `dist/wm8741-ble.umd.js`；
2. 提供一个脚本/工具（如 `web/scripts/embed-to-c.js`），将 UMD bundle 转换为 C 字符串，写入 `main/wm8741_ble_js.h`；
3. 在 `main/i2c_basic_example_main.c` 中：
   - `#include "wm8741_ble_js.h"`
   - 新增 `/wm8741-ble.js` URI handler，返回该 C 字符串，Content-Type 为 `application/javascript`；
4. 重写 `main/index.html`：
   - 移除所有内联 Web Bluetooth 脚本；
   - 引入 `<script src="/wm8741-ble.js"></script>`；
   - 使用 `new WM8741BLEClient()` 绑定 DOM 事件。

### 4. 测试策略

由于 Web Bluetooth 需要真实浏览器和安全上下文，测试采用分层策略：

- **单元测试（Vitest）**：使用 `tests/mocks/fake-bluetooth.ts` 完整 mock `navigator.bluetooth`、GATT server、service、characteristic，覆盖状态机、协议、GATT 操作、WM8741 客户端。
- **集成测试（Vitest + happy-dom/jsdom）**：在 DOM 环境中加载示例 HTML，注入 mock Web Bluetooth，模拟用户点击连接、下发命令、接收通知，验证 UI 状态流转。
- **端到端（可选，手动）**：真实 ESP32 + Chrome/Edge 浏览器打开页面，验证实际连接与控制。

### 5. 文档

- `web/README.md`：项目说明、构建与测试命令；
- `web/docs/API.md`：完整 API 参考；
- `web/docs/USAGE.md`：使用示例与最佳实践；
- `web/examples/wm8741-controller.html`：可直接运行的示例页面。

## Critical Files to Modify / Create

### 前端

- `web/package.json`
- `web/tsconfig.json`
- `web/vite.config.ts`
- `web/vitest.config.ts`
- `web/src/index.ts`
- `web/src/types.ts`
- `web/src/constants.ts`
- `web/src/errors.ts`
- `web/src/state-machine.ts`
- `web/src/device-manager.ts`
- `web/src/gatt-manager.ts`
- `web/src/protocol.ts`
- `web/src/wm8741-client.ts`
- `web/tests/mocks/fake-bluetooth.ts`
- `web/tests/mocks/fake-gatt.ts`
- `web/tests/unit/*.test.ts`
- `web/tests/integration/*.test.ts`
- `web/examples/wm8741-controller.html`
- `web/docs/API.md`
- `web/docs/USAGE.md`

### 固件

- `main/ble_gatt_server.h`（新建）
- `main/ble_gatt_server.c`（新建）
- `main/wm8741_commands.h`（新建，命令处理公共接口）
- `main/wm8741_commands.c`（新建，提取现有 `handle_command`）
- `main/CMakeLists.txt`（更新，加入新 C 文件）
- `main/i2c_basic_example_main.c`（修改：包含 JS C 字符串、注册 `/wm8741-ble.js`、调用 BLE 初始化、复用命令函数）
- `main/index.html`（重写，使用新库）
- `main/wm8741_ble_js.h`（生成产物，不手动编辑）

## Verification Plan

1. **环境搭建**：在 `web/` 下执行 `npm install`，确认 Vite + Vitest 可运行；
2. **单元测试**：运行 `npm run test:unit`，所有状态机、协议、GATT、WM8741 客户端测试通过；
3. **集成测试**：运行 `npm run test:integration`，模拟 DOM + mock 蓝牙通过连接与命令流程；
4. **构建产物**：运行 `npm run build`，生成 `dist/wm8741-ble.umd.js`；
5. **嵌入固件**：运行 `npm run embed`，生成/更新 `main/wm8741_ble_js.h`；
6. **固件编译**：在项目根目录运行 `idf.py build`，确保新增 C 文件编译通过；
7. **端到端验证（手动）**：
   - 烧录固件到 ESP32；
   - 使用 Chrome/Edge 打开设备 IP；
   - 点击“连接设备”，选择 `WM8741_DAC`；
   - 验证音量、滤波器、静音、寄存器写入等功能；
   - 断开/重启设备，验证自动重连与状态反馈。

## Risks & Mitigations

| 风险 | 缓解措施 |
|------|----------|
| Web Bluetooth 仅 Chrome/Edge 支持 | 提供 `if (!navigator.bluetooth)` 检测与友好提示，文档明确浏览器要求。 |
| 自动重连需要用户授权 | 重连失败最终进入 `disconnected`，由用户手动触发；不无限重试。 |
| Wi-Fi + BLE 同时运行增加内存/功耗压力 | NimBLE 配置保持最小任务栈；必要时在 Kconfig 中提供“禁用 TCP server”选项。 |
| 固件 GATT Server 与 Web UUID 不一致 | 统一在 `web/src/constants.ts` 和 `main/ble_gatt_server.h` 中引用相同 UUID，文档中显式列出。 |
| 构建产物嵌入 C 字符串后未更新 | 提供 `npm run embed` 脚本，并在 `web/README.md` 中说明必须执行该步骤。 |
