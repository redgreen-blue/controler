/**
 * Base error for all BLE operations.
 */
export class BLEError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'BLEError';
  }
}

/**
 * Thrown when the browser does not support Web Bluetooth,
 * or the current context is not secure (HTTPS/localhost).
 */
export class NotSupportedError extends BLEError {
  constructor(message = 'Web Bluetooth is not supported in this browser or context') {
    super(message, 'NOT_SUPPORTED');
    this.name = 'NotSupportedError';
  }
}

/**
 * Thrown when the user denies pairing/connection,
 * or when the operation is cancelled by the user.
 */
export class SecurityError extends BLEError {
  constructor(message = 'Bluetooth pairing or connection was denied', cause?: Error) {
    super(message, 'SECURITY', cause);
    this.name = 'SecurityError';
  }
}

/**
 * Thrown when a GATT connection cannot be established or is lost unexpectedly.
 */
export class ConnectionError extends BLEError {
  constructor(message = 'Bluetooth connection failed', cause?: Error) {
    super(message, 'CONNECTION', cause);
    this.name = 'ConnectionError';
  }
}

/**
 * Thrown when a connection or command response times out.
 */
export class ConnectionTimeoutError extends BLEError {
  constructor(message = 'Bluetooth operation timed out') {
    super(message, 'TIMEOUT');
    this.name = 'ConnectionTimeoutError';
  }
}

/**
 * Thrown when a GATT service or characteristic operation fails.
 */
export class GATTError extends BLEError {
  constructor(message = 'GATT operation failed', cause?: Error) {
    super(message, 'GATT', cause);
    this.name = 'GATTError';
  }
}

/**
 * Thrown when a command response is malformed or unexpected.
 */
export class ProtocolError extends BLEError {
  constructor(message = 'Protocol error') {
    super(message, 'PROTOCOL');
    this.name = 'ProtocolError';
  }
}

/**
 * Thrown when an operation is invoked while the client is in the wrong state.
 */
export class StateError extends BLEError {
  constructor(message = 'Invalid operation for current connection state') {
    super(message, 'INVALID_STATE');
    this.name = 'StateError';
  }
}
