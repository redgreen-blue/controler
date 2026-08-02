// Core client
export { WM8741BLEClient } from './wm8741-client.js';

// Sub-modules for advanced users
export { ConnectionStateMachine } from './state-machine.js';
export { DeviceManager } from './device-manager.js';
export { GATTManager } from './gatt-manager.js';
export { CommandProtocol } from './protocol.js';

// Constants
export {
  DEFAULT_SERVICE_UUID,
  DEFAULT_CMD_CHARACTERISTIC_UUID,
  DEFAULT_RESP_CHARACTERISTIC_UUID,
  DEFAULT_DEVICE_NAME,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_MAX_RECONNECT_ATTEMPTS,
  DEFAULT_RECONNECT_BASE_DELAY_MS,
  DEFAULT_RECONNECT_MAX_DELAY_MS
} from './constants.js';

// Error classes
export {
  BLEError,
  NotSupportedError,
  SecurityError,
  ConnectionError,
  ConnectionTimeoutError,
  GATTError,
  ProtocolError,
  StateError
} from './errors.js';

// Types and events
export type {
  ConnectionState,
  BluetoothDeviceInfo,
  WM8741BLEClientOptions,
  ScanOptions,
  CommandOptions,
  DataFormat,
  BLEResult
} from './types.js';

export {
  StateChangeEvent,
  DisconnectEvent,
  ResponseEvent
} from './types.js';
