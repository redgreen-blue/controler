# API 参考

## `WM8741BLEClient`

Web Bluetooth 控制主类，继承自 `EventTarget`。

### 构造函数

```typescript
const client = new WM8741BLEClient(options?);
```

#### `WM8741BLEClientOptions`

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `serviceUuid` | `string` | `12345678-1234-5678-1234-56789abcdef0` | GATT 服务 UUID |
| `cmdCharacteristicUuid` | `string` | `12345678-1234-5678-1234-56789abcdef1` | 命令写入特征值 UUID |
| `respCharacteristicUuid` | `string` | `12345678-1234-5678-1234-56789abcdef2` | 响应通知特征值 UUID |
| `deviceName` | `string` | `WM8741_DAC` | 默认扫描设备名 |
| `commandTimeoutMs` | `number` | `3000` | 命令响应超时（毫秒） |
| `maxReconnectAttempts` | `number` | `5` | 最大自动重连次数 |
| `reconnectBaseDelayMs` | `number` | `1000` | 指数退避基础延迟 |
| `reconnectMaxDelayMs` | `number` | `30000` | 最大重连延迟 |

### 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `state` | `ConnectionState` | 当前连接状态 |
| `isConnected` | `boolean` | 是否已连接 |
| `deviceName` | `string \| null` | 已连接设备名称 |

### 方法

#### `scan(options?: ScanOptions): Promise<BluetoothDeviceInfo>`

弹出浏览器设备选择框，返回选中设备信息。

#### `connect(deviceInfo?: BluetoothDeviceInfo): Promise<void>`

连接设备。如果未提供 `deviceInfo`，会先调用 `scan()`。

#### `disconnect(): Promise<void>`

断开连接并取消自动重连。

#### `sendCommand(cmd: string, options?: CommandOptions): Promise<string>`

发送原始文本命令并等待响应通知。

#### `setVolume(steps: number): Promise<string>`

设置音量衰减，范围 `0~127`。

#### `setFilter(response: 1 | 2 | 3 | 4 | 5): Promise<string>`

设置滤波器响应。

#### `setMute(enable: boolean): Promise<string>`

设置静音开关。

#### `setVolumeRamp(enable: boolean): Promise<string>`

设置音量渐变开关（写入寄存器 `0x04` 对应位）。

#### `setAntiClip(enable: boolean): Promise<string>`

设置防削波开关。

#### `reset(): Promise<string>`

复位 WM8741。

#### `writeRegister(reg: number, value: number): Promise<string>`

直接写入寄存器，`reg` 范围 `0~0x7F`，`value` 范围 `0~0xFF`。

### 事件

| 事件名 | 事件类型 | 说明 |
|--------|----------|------|
| `statechange` | `StateChangeEvent` | 连接状态变化 |
| `disconnect` | `DisconnectEvent` | GATT 断开 |
| `response` | `ResponseEvent` | 收到响应通知 |
| `error` | `ErrorEvent` | 发生错误 |

## `ConnectionStateMachine`

连接状态机。

```typescript
const sm = new ConnectionStateMachine();
sm.transition('scanning');
console.log(sm.state); // 'scanning'
```

## `GATTManager`

GATT 操作封装。

```typescript
const gatt = new GATTManager();
const service = await gatt.getPrimaryService(server, serviceUuid);
const chars = await gatt.getCharacteristics(service, [cmdUuid, respUuid]);
await gatt.writeValue(cmdChar, data);
await gatt.startNotifications(respChar, handler);
```

## `CommandProtocol`

协议工具方法。

| 方法 | 说明 |
|------|------|
| `encodeCommand(cmd)` | 文本命令编码为 `Uint8Array` |
| `decodeResponse(value)` | 将 `DataView` 解码为 UTF-8 字符串 |
| `bytesToHex(bytes)` | 字节数组转十六进制字符串 |
| `hexToBytes(hex)` | 十六进制字符串转字节数组 |
| `parseRegisterResponse(response)` | 解析寄存器写入响应 |

## 错误类

- `BLEError`
- `NotSupportedError`
- `SecurityError`
- `ConnectionError`
- `ConnectionTimeoutError`
- `GATTError`
- `ProtocolError`
- `StateError`

所有错误类都继承自 `BLEError`，并提供 `code` 字段。
