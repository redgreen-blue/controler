import {
  NotSupportedError,
  SecurityError,
  ConnectionError
} from './errors.js';
import { ScanOptions, BluetoothDeviceInfo } from './types.js';

/**
 * Abstraction over `navigator.bluetooth` for device discovery and pairing.
 */
export class DeviceManager {
  /**
   * Verify that Web Bluetooth is available in the current browsing context.
   */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' &&
      'bluetooth' in navigator &&
      typeof (navigator as Navigator).bluetooth?.requestDevice === 'function';
  }

  /**
   * Build Web Bluetooth `requestDevice` options from our `ScanOptions`.
   */
  private buildRequestOptions(options: ScanOptions): RequestDeviceOptions {
    if (options.acceptAllDevices) {
      return {
        acceptAllDevices: true,
        optionalServices: options.serviceUuid ? [options.serviceUuid] : undefined
      };
    }

    const filters: BluetoothLEScanFilter[] = [];

    if (options.filters && options.filters.length > 0) {
      filters.push(...options.filters);
    }

    if (options.name) {
      filters.push({ name: options.name });
    }

    if (filters.length === 0) {
      return {
        acceptAllDevices: true,
        optionalServices: options.serviceUuid ? [options.serviceUuid] : undefined
      };
    }

    return {
      filters,
      optionalServices: options.serviceUuid ? [options.serviceUuid] : undefined
    };
  }

  /**
   * Scan for and request a single Bluetooth device from the user.
   *
   * @returns The selected `BluetoothDevice`.
   */
  async requestDevice(options: ScanOptions = {}): Promise<BluetoothDevice> {
    if (!DeviceManager.isSupported()) {
      throw new NotSupportedError(
        'Web Bluetooth is not supported. Please use Chrome, Edge, or another Chromium-based browser, ' +
        'and ensure the page is loaded over HTTPS or localhost.'
      );
    }

    try {
      const requestOptions = this.buildRequestOptions(options);
      const device = await navigator.bluetooth.requestDevice(requestOptions);
      return device;
    } catch (err) {
      const error = err as Error;
      if (error.name === 'NotFoundError' || error.name === 'SecurityError') {
        throw new SecurityError(
          'Bluetooth device selection was cancelled or denied by the user.',
          error
        );
      }
      throw new ConnectionError(`Failed to request Bluetooth device: ${error.message}`, error);
    }
  }

  /**
   * Request a device and return simplified device information.
   */
  async scan(options: ScanOptions = {}): Promise<BluetoothDeviceInfo> {
    const device = await this.requestDevice(options);
    return {
      id: device.id,
      name: device.name ?? null
    };
  }

  /**
   * Connect to the GATT server of a previously selected device.
   */
  async connectGatt(device: BluetoothDevice): Promise<BluetoothRemoteGATTServer> {
    if (!device.gatt) {
      throw new ConnectionError('Bluetooth device does not expose a GATT server');
    }

    try {
      const server = await device.gatt.connect();
      return server;
    } catch (err) {
      const error = err as Error;
      throw new ConnectionError(`Failed to connect to GATT server: ${error.message}`, error);
    }
  }
}
