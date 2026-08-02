import { describe, it, expect } from 'vitest';
import { GATTManager } from '../../src/gatt-manager.js';
import { FakeBluetoothDevice } from '../mocks/fake-gatt.js';
import { GATTError } from '../../src/errors.js';

describe('GATTManager', () => {
  it('discovers a primary service', async () => {
    const device = new FakeBluetoothDevice('id-1', 'WM8741_DAC');
    device.addService('12345678-1234-5678-1234-56789abcdef0');

    const manager = new GATTManager();
    const server = await device.gatt.connect();
    const service = await manager.getPrimaryService(server, '12345678-1234-5678-1234-56789abcdef0');

    expect(service.uuid).toBe('12345678-1234-5678-1234-56789abcdef0');
  });

  it('throws when service is not found', async () => {
    const device = new FakeBluetoothDevice('id-1', 'WM8741_DAC');
    const manager = new GATTManager();
    const server = await device.gatt.connect();

    await expect(manager.getPrimaryService(server, 'missing-uuid')).rejects.toThrow(GATTError);
  });

  it('discovers characteristics and maps them by UUID', async () => {
    const device = new FakeBluetoothDevice('id-1', 'WM8741_DAC');
    const service = device.addService('12345678-1234-5678-1234-56789abcdef0');
    service.addCharacteristic('12345678-1234-5678-1234-56789abcdef1');
    service.addCharacteristic('12345678-1234-5678-1234-56789abcdef2');

    const manager = new GATTManager();
    const server = await device.gatt.connect();
    const discoveredService = await manager.getPrimaryService(server, service.uuid);
    const characteristics = await manager.getCharacteristics(discoveredService, [
      '12345678-1234-5678-1234-56789abcdef1',
      '12345678-1234-5678-1234-56789abcdef2'
    ]);

    expect(characteristics.size).toBe(2);
    expect(characteristics.has('12345678-1234-5678-1234-56789abcdef1')).toBe(true);
  });

  it('starts and stops notifications', async () => {
    const device = new FakeBluetoothDevice('id-1', 'WM8741_DAC');
    const service = device.addService('12345678-1234-5678-1234-56789abcdef0');
    const characteristic = service.addCharacteristic('12345678-1234-5678-1234-56789abcdef2');

    const manager = new GATTManager();
    const handler = () => { /* no-op */ };

    await manager.startNotifications(characteristic.asBluetoothCharacteristic(), handler);
    expect(characteristic.isNotifying()).toBe(true);

    await manager.stopNotifications(characteristic.asBluetoothCharacteristic(), handler);
    expect(characteristic.isNotifying()).toBe(false);
  });

  it('writes a value to a characteristic', async () => {
    const device = new FakeBluetoothDevice('id-1', 'WM8741_DAC');
    const service = device.addService('12345678-1234-5678-1234-56789abcdef0');
    const characteristic = service.addCharacteristic('12345678-1234-5678-1234-56789abcdef1');

    const manager = new GATTManager();
    const data = new TextEncoder().encode('VOLUME 50\n');
    await manager.writeValue(characteristic.asBluetoothCharacteristic(), data);

    const written = characteristic.getWrittenValues();
    expect(written.length).toBe(1);
    expect(new TextDecoder().decode(written[0])).toBe('VOLUME 50\n');
  });
});
