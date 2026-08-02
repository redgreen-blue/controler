/**
 * Default UUIDs for the WM8741 BLE service.
 *
 * These must match the values exposed by the ESP32 GATT server.
 */
/* 16-bit custom UUIDs expanded to their canonical 128-bit form.
 * Service: 0x1234, CMD: 0x1235, RESP: 0x1236 */
export const DEFAULT_SERVICE_UUID = '00001234-0000-1000-8000-00805f9b34fb'.toLowerCase();
export const DEFAULT_CMD_CHARACTERISTIC_UUID = '00001235-0000-1000-8000-00805f9b34fb'.toLowerCase();
export const DEFAULT_RESP_CHARACTERISTIC_UUID = '00001236-0000-1000-8000-00805f9b34fb'.toLowerCase();

/** Default device name filter. */
export const DEFAULT_DEVICE_NAME = 'WM8741_DAC';

/** Default command response timeout in milliseconds. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 3000;

/** Default maximum number of automatic reconnection attempts. */
export const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

/** Base delay for exponential backoff (milliseconds). */
export const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000;

/** Maximum delay between reconnection attempts (milliseconds). */
export const DEFAULT_RECONNECT_MAX_DELAY_MS = 30000;

/** Default delay before the first reconnection attempt (milliseconds). */
export const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 1000;

/** User agent feature name for Web Bluetooth. */
export const WEB_BLUETOOTH_FEATURE = 'bluetooth';
