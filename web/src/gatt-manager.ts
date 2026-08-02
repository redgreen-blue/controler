import { GATTError } from './errors.js';

/**
 * High-level wrapper around GATT service/characteristic operations.
 */
export class GATTManager {
  /**
   * Discover a primary service by UUID.
   */
  async getPrimaryService(
    server: BluetoothRemoteGATTServer,
    uuid: BluetoothServiceUUID
  ): Promise<BluetoothRemoteGATTService> {
    try {
      return await server.getPrimaryService(uuid);
    } catch (err) {
      const error = err as Error;
      throw new GATTError(`Service ${uuid} not found: ${error.message}`, error);
    }
  }

  /**
   * Discover multiple characteristics on a service.
   */
  async getCharacteristics(
    service: BluetoothRemoteGATTService,
    uuids: BluetoothCharacteristicUUID[]
  ): Promise<Map<string, BluetoothRemoteGATTCharacteristic>> {
    const map = new Map<string, BluetoothRemoteGATTCharacteristic>();

    for (const uuid of uuids) {
      const uuidString = typeof uuid === 'number' ? uuid.toString(16) : uuid.toString();
      try {
        const characteristic = await service.getCharacteristic(uuid);
        map.set(uuidString.toLowerCase(), characteristic);
      } catch (err) {
        const error = err as Error;
        throw new GATTError(`Characteristic ${uuid} not found: ${error.message}`, error);
      }
    }

    return map;
  }

  /**
   * Read the value of a characteristic and return the underlying `DataView`.
   */
  async readValue(
    characteristic: BluetoothRemoteGATTCharacteristic
  ): Promise<DataView> {
    try {
      return await characteristic.readValue();
    } catch (err) {
      const error = err as Error;
      throw new GATTError(`Failed to read characteristic: ${error.message}`, error);
    }
  }

  /**
   * Write a raw buffer to a characteristic.
   */
  async writeValue(
    characteristic: BluetoothRemoteGATTCharacteristic,
    value: BufferSource
  ): Promise<void> {
    try {
      await characteristic.writeValue(value);
    } catch (err) {
      const error = err as Error;
      throw new GATTError(`Failed to write characteristic: ${error.message}`, error);
    }
  }

  /**
   * Write without response when supported.
   */
  async writeValueWithoutResponse(
    characteristic: BluetoothRemoteGATTCharacteristic,
    value: BufferSource
  ): Promise<void> {
    try {
      await characteristic.writeValueWithoutResponse(value);
    } catch (err) {
      const error = err as Error;
      throw new GATTError(
        `Failed to write characteristic without response: ${error.message}`,
        error
      );
    }
  }

  /**
   * Subscribe to value-changed notifications on a characteristic.
   */
  async startNotifications(
    characteristic: BluetoothRemoteGATTCharacteristic,
    handler: (event: Event) => void
  ): Promise<void> {
    try {
      characteristic.addEventListener('characteristicvaluechanged', handler);
      await characteristic.startNotifications();
    } catch (err) {
      characteristic.removeEventListener('characteristicvaluechanged', handler);
      const error = err as Error;
      throw new GATTError(`Failed to start notifications: ${error.message}`, error);
    }
  }

  /**
   * Unsubscribe from notifications.
   */
  async stopNotifications(
    characteristic: BluetoothRemoteGATTCharacteristic,
    handler: (event: Event) => void
  ): Promise<void> {
    try {
      await characteristic.stopNotifications();
    } catch (err) {
      // Best-effort cleanup; still remove the listener below.
    } finally {
      characteristic.removeEventListener('characteristicvaluechanged', handler);
    }
  }
}
