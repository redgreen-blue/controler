/**
 * Connection lifecycle states.
 */
export type ConnectionState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'discovering-services'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'reconnecting';

/**
 * Simplified device information returned after scanning.
 */
export interface BluetoothDeviceInfo {
  id: string;
  name: string | null;
}

/**
 * Options for the WM8741 BLE client.
 */
export interface WM8741BLEClientOptions {
  /** Service UUID to connect to. */
  serviceUuid?: string;
  /** UUID of the command (write) characteristic. */
  cmdCharacteristicUuid?: string;
  /** UUID of the response (notify) characteristic. */
  respCharacteristicUuid?: string;
  /** Default device name filter for scanning. */
  deviceName?: string;
  /** Command response timeout in milliseconds. */
  commandTimeoutMs?: number;
  /** Maximum number of automatic reconnection attempts. */
  maxReconnectAttempts?: number;
  /** Base delay for exponential backoff reconnection (ms). */
  reconnectBaseDelayMs?: number;
  /** Maximum delay between reconnection attempts (ms). */
  reconnectMaxDelayMs?: number;
}

/**
 * Options for scanning devices.
 */
export interface ScanOptions {
  /** Device name or name prefix filter. */
  name?: string;
  /** Optional service UUID filter. */
  serviceUuid?: string;
  /** Additional Web Bluetooth filters. */
  filters?: BluetoothLEScanFilter[];
  /** Accept all devices (no filtering) - use with caution. */
  acceptAllDevices?: boolean;
}

/**
 * Options for sending a raw command.
 */
export interface CommandOptions {
  /** Override the default command timeout. */
  timeoutMs?: number;
  /** Do not wait for a response notification. */
  noResponse?: boolean;
}

/**
 * Data adapter output formats.
 */
export type DataFormat = 'utf8' | 'hex' | 'bytes' | 'dataview';

/**
 * Generic GATT operation result wrapper.
 */
export interface BLEResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

/**
 * Event map for WM8741BLEClient.
 */
export interface WM8741BLEClientEventMap {
  statechange: StateChangeEvent;
  disconnect: DisconnectEvent;
  response: ResponseEvent;
  error: ErrorEvent;
}

/**
 * Custom event dispatched when connection state changes.
 */
export class StateChangeEvent extends Event {
  constructor(
    public readonly state: ConnectionState,
    public readonly previousState: ConnectionState,
    public readonly reason?: string
  ) {
    super('statechange');
  }
}

/**
 * Custom event dispatched when the GATT server disconnects.
 */
export class DisconnectEvent extends Event {
  constructor(public readonly unexpected: boolean) {
    super('disconnect');
  }
}

/**
 * Custom event dispatched when a response notification is received.
 */
export class ResponseEvent extends Event {
  constructor(public readonly response: string) {
    super('response');
  }
}
