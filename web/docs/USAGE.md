# 使用指南

## 基本用法

### 1. 通过 `<script>` 引入 UMD 构建产物

```html
<script src="/wm8741-ble.js"></script>
<script>
  const client = new WM8741BLE.WM8741BLEClient();

  document.getElementById('connectBtn').addEventListener('click', async () => {
    try {
      await client.connect();
      console.log('已连接');
    } catch (err) {
      console.error(err);
    }
  });
</script>
```

### 2. 通过 ES Module 引入

```html
<script type="module">
  import { WM8741BLEClient } from '/wm8741-ble.esm.js';

  const client = new WM8741BLEClient();
  await client.connect();
</script>
```

### 3. 监听状态与事件

```javascript
client.addEventListener('statechange', (event) => {
  console.log(`状态: ${event.previousState} -> ${event.state}`);
});

client.addEventListener('disconnect', (event) => {
  if (event.unexpected) {
    console.warn('意外断开，正在自动重连...');
  }
});

client.addEventListener('response', (event) => {
  console.log('收到响应:', event.response);
});
```

## 控制 WM8741

```javascript
// 音量
await client.setVolume(50);

// 滤波器
await client.setFilter(3);

// 静音
await client.setMute(true);

// 音量渐变
await client.setVolumeRamp(true);

// 防削波
await client.setAntiClip(true);

// 复位
await client.reset();

// 直接写寄存器
await client.writeRegister(0x04, 0x01);
```

## 发送原始命令

如果需要发送自定义命令：

```javascript
const response = await client.sendCommand('GET_IP');
console.log(response);
```

可以配置单次命令超时：

```javascript
const response = await client.sendCommand('CUSTOM_CMD', { timeoutMs: 5000 });
```

## 错误处理

```javascript
import { NotSupportedError, ConnectionTimeoutError } from '/wm8741-ble.esm.js';

try {
  await client.connect();
} catch (err) {
  if (err instanceof NotSupportedError) {
    alert('请使用 Chrome 或 Edge 浏览器');
  } else if (err instanceof ConnectionTimeoutError) {
    alert('设备响应超时');
  } else {
    alert('连接失败: ' + err.message);
  }
}
```

## 自动重连

当 GATT 服务器意外断开时，客户端会自动重连。重连策略为指数退避，最大重连次数和延迟可在构造选项中配置：

```javascript
const client = new WM8741BLEClient({
  maxReconnectAttempts: 10,
  reconnectBaseDelayMs: 500,
  reconnectMaxDelayMs: 10000
});
```

调用 `client.disconnect()` 会取消自动重连。

## 安全上下文

Web Bluetooth 要求页面位于安全上下文：

- 开发环境：使用 `http://localhost` 或 `https://`；
- 生产环境：为 ESP32 HTTP server 启用 TLS，或使用本地回环。

## 完整示例

参见 [examples/wm8741-controller.html](../examples/wm8741-controller.html)。
