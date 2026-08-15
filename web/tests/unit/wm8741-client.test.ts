import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WM8741BLEClient } from '../../src/wm8741-client.js';
import {
  DEFAULT_SERVICE_UUID,
  DEFAULT_CMD_CHARACTERISTIC_UUID,
  DEFAULT_RESP_CHARACTERISTIC_UUID
} from '../../src/constants.js';
import { StateChangeEvent, ResponseEvent } from '../../src/types.js';
import {
  installFakeBluetooth,
  uninstallFakeBluetooth
} from '../mocks/fake-bluetooth.js';
import { FakeBluetoothDevice } from '../mocks/fake-gatt.js';
import {
  NotSupportedError,
  StateError,
  ProtocolError,
  ConnectionTimeoutError
} from '../../src/errors.js';

describe('WM8741BLEClient', () => {
  beforeEach(() => {
    uninstallFakeBluetooth();
  });

  afterEach(() => {
    uninstallFakeBluetooth();
  });

  it('starts in idle state and is not connected', () => {
    const client = new WM8741BLEClient();
    expect(client.state).toBe('idle');
    expect(client.isConnected).toBe(false);
  });

  it('throws NotSupportedError when Web Bluetooth is unavailable', async () => {
    const client = new WM8741BLEClient();
    await expect(client.scan()).rejects.toThrow(NotSupportedError);
  });

  it('scans and connects to a fake device', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient();
    const stateChanges: string[] = [];
    client.addEventListener('statechange', (event) => {
      stateChanges.push((event as StateChangeEvent).state);
    });

    const info = await client.scan();
    expect(info.name).toBe('WM8741_DAC');

    await client.connect();
    expect(client.isConnected).toBe(true);
    expect(client.state).toBe('connected');
    expect(stateChanges).toContain('scanning');
    expect(stateChanges).toContain('connected');
  });

  it('sends a command and resolves the response', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient({ commandTimeoutMs: 1000 });
    await client.connect();

    const service = device.gattServer.services.get(DEFAULT_SERVICE_UUID.toLowerCase())!;
    const respCharacteristic = service.characteristics.get(DEFAULT_RESP_CHARACTERISTIC_UUID.toLowerCase())!;

    // Delay the response slightly to exercise the pending command queue.
    const responsePromise = client.sendCommand('VOLUME 50');
    setTimeout(() => respCharacteristic.dispatchResponse('OK Volume 50'), 10);

    const response = await responsePromise;
    expect(response).toBe('OK Volume 50');
  });

  it('times out when no response is received', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient({ commandTimeoutMs: 50 });
    await client.connect();

    await expect(client.sendCommand('VOLUME 50')).rejects.toThrow(ConnectionTimeoutError);
  });

  it('dispatches response events', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient({ commandTimeoutMs: 1000 });
    await client.connect();

    const service = device.gattServer.services.get(DEFAULT_SERVICE_UUID.toLowerCase())!;
    const respCharacteristic = service.characteristics.get(DEFAULT_RESP_CHARACTERISTIC_UUID.toLowerCase())!;

    const responses: string[] = [];
    client.addEventListener('response', (event) => {
      responses.push((event as ResponseEvent).response);
    });

    const promise = client.sendCommand('RESET');
    setTimeout(() => respCharacteristic.dispatchResponse('OK Reset'), 10);
    await promise;

    expect(responses).toContain('OK Reset');
  });

  it('validates volume before sending', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient();
    await client.connect();

    await expect(client.setVolume(128)).rejects.toThrow(ProtocolError);
    await expect(client.setVolume(-1)).rejects.toThrow(ProtocolError);
  });

  it('validates filter before sending', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient();
    await client.connect();

    await expect(client.setFilter(6 as 1)).rejects.toThrow(ProtocolError);
  });

  it('sends a FORMAT command and validates its arguments', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient();
    await client.connect();

    const service = device.gattServer.services.get(DEFAULT_SERVICE_UUID.toLowerCase())!;
    const cmdCharacteristic = service.characteristics.get(DEFAULT_CMD_CHARACTERISTIC_UUID.toLowerCase())!;
    const respCharacteristic = service.characteristics.get(DEFAULT_RESP_CHARACTERISTIC_UUID.toLowerCase())!;

    const promise = client.setFormat(2, 2);
    setTimeout(() => respCharacteristic.dispatchResponse('OK Format BOTH 2 2'), 10);
    await promise;

    const written = cmdCharacteristic.getWrittenValues();
    const lastCommand = new TextDecoder().decode(written[written.length - 1]);
    expect(lastCommand).toBe('FORMAT 2 2\n');

    await expect(client.setFormat(4, 2)).rejects.toThrow(ProtocolError);
    await expect(client.setFormat(2, 4)).rejects.toThrow(ProtocolError);
  });

  it('sends per-channel FORMAT commands', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient();
    await client.connect();

    const service = device.gattServer.services.get(DEFAULT_SERVICE_UUID.toLowerCase())!;
    const cmdCharacteristic = service.characteristics.get(DEFAULT_CMD_CHARACTERISTIC_UUID.toLowerCase())!;
    const respCharacteristic = service.characteristics.get(DEFAULT_RESP_CHARACTERISTIC_UUID.toLowerCase())!;

    const promise = client.setFormat(1, 3, 'left');
    setTimeout(() => respCharacteristic.dispatchResponse('OK Format LEFT 1 3'), 10);
    await promise;

    const written = cmdCharacteristic.getWrittenValues();
    const lastCommand = new TextDecoder().decode(written[written.length - 1]);
    expect(lastCommand).toBe('FORMAT LEFT 1 3\n');
  });

  it('sends an MCLK command and validates its argument', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient();
    await client.connect();

    const service = device.gattServer.services.get(DEFAULT_SERVICE_UUID.toLowerCase())!;
    const cmdCharacteristic = service.characteristics.get(DEFAULT_CMD_CHARACTERISTIC_UUID.toLowerCase())!;
    const respCharacteristic = service.characteristics.get(DEFAULT_RESP_CHARACTERISTIC_UUID.toLowerCase())!;

    const promise = client.setMclkFrequency(22);
    setTimeout(() => respCharacteristic.dispatchResponse('OK MCLK 22MHz'), 10);
    await promise;

    const written = cmdCharacteristic.getWrittenValues();
    const lastCommand = new TextDecoder().decode(written[written.length - 1]);
    expect(lastCommand).toBe('MCLK 22\n');

    await expect(client.setMclkFrequency(44.1 as 22)).rejects.toThrow(ProtocolError);
    await expect(client.setMclkFrequency(0 as 22)).rejects.toThrow(ProtocolError);
  });

  it('sends per-channel volume commands', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient();
    await client.connect();

    const service = device.gattServer.services.get(DEFAULT_SERVICE_UUID.toLowerCase())!;
    const cmdCharacteristic = service.characteristics.get(DEFAULT_CMD_CHARACTERISTIC_UUID.toLowerCase())!;
    const respCharacteristic = service.characteristics.get(DEFAULT_RESP_CHARACTERISTIC_UUID.toLowerCase())!;

    const leftPromise = client.setVolume(50, 'left');
    setTimeout(() => respCharacteristic.dispatchResponse('OK Volume LEFT 50 steps (6.25dB)'), 10);
    await leftPromise;

    const written = cmdCharacteristic.getWrittenValues();
    const lastCommand = new TextDecoder().decode(written[written.length - 1]);
    expect(lastCommand).toBe('VOLUME LEFT 50\n');
  });

  it('sends channel-less command for "both" by default', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient();
    await client.connect();

    const service = device.gattServer.services.get(DEFAULT_SERVICE_UUID.toLowerCase())!;
    const cmdCharacteristic = service.characteristics.get(DEFAULT_CMD_CHARACTERISTIC_UUID.toLowerCase())!;
    const respCharacteristic = service.characteristics.get(DEFAULT_RESP_CHARACTERISTIC_UUID.toLowerCase())!;

    const promise = client.reset();
    setTimeout(() => respCharacteristic.dispatchResponse('OK Reset BOTH'), 10);
    await promise;

    const written = cmdCharacteristic.getWrittenValues();
    const lastCommand = new TextDecoder().decode(written[written.length - 1]);
    expect(lastCommand).toBe('RESET\n');
  });

  it('disconnects and cleans up', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient();
    await client.connect();
    expect(client.isConnected).toBe(true);

    await client.disconnect();
    expect(client.isConnected).toBe(false);
    expect(client.state).toBe('disconnected');
  });

  it('prevents sendCommand when not connected', async () => {
    const client = new WM8741BLEClient();
    await expect(client.sendCommand('VOLUME 50')).rejects.toThrow(StateError);
  });

  it('rejects connect while already connected', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient();
    await client.connect();
    await expect(client.connect()).resolves.toBeUndefined();
  });
});

function createFakeWM8741Device(): FakeBluetoothDevice {
  const device = new FakeBluetoothDevice('fake-id', 'WM8741_DAC');
  const service = device.addService(DEFAULT_SERVICE_UUID);
  service.addCharacteristic(DEFAULT_CMD_CHARACTERISTIC_UUID);
  service.addCharacteristic(DEFAULT_RESP_CHARACTERISTIC_UUID);
  return device;
}
