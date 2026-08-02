/**
 * Default UUIDs for the WM8741 BLE service.
 *
 * These must match the values exposed by the ESP32 GATT server.
 */
export const DEFAULT_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
export const DEFAULT_CMD_CHARACTERISTIC_UUID = '12345678-1234-5678-1234-56789abcdef1';
export const DEFAULT_RESP_CHARACTERISTIC_UUID = '12345678-1234-5678-1234-56789abcdef2';

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
