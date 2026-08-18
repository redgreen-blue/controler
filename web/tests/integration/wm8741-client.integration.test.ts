/**
 * @vitest-environment jsdom
 */

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

describe('WM8741BLEClient integration', () => {
  beforeEach(() => {
    uninstallFakeBluetooth();
    document.body.innerHTML = `
      <button id="connect">Connect</button>
      <span id="status">idle</span>
      <input type="range" id="volume" min="0" max="127" value="0" />
      <button id="apply-volume">Apply Volume</button>
      <div id="log"></div>
    `;
  });

  afterEach(() => {
    uninstallFakeBluetooth();
  });

  it('updates the UI through the full connect-and-control flow', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient();
    const statusEl = document.getElementById('status')!;
    const logEl = document.getElementById('log')!;

    client.addEventListener('statechange', (event) => {
      statusEl.textContent = (event as StateChangeEvent).state;
    });

    client.addEventListener('response', (event) => {
      logEl.textContent += '< ' + (event as ResponseEvent).response + '\n';
    });

    await client.connect();
    expect(statusEl.textContent).toBe('connected');

    const service = device.gattServer.services.get(DEFAULT_SERVICE_UUID.toLowerCase())!;
    const respCharacteristic = service.characteristics.get(DEFAULT_RESP_CHARACTERISTIC_UUID.toLowerCase())!;

    const applyPromise = client.writeRegister(0x04, 0x01);
    setTimeout(() => respCharacteristic.dispatchResponse('OK Reg BOTH 0x04=0x01'), 10);
    const response = await applyPromise;

    expect(response).toBe('OK Reg BOTH 0x04=0x01');
    expect(logEl.textContent).toContain('OK Reg BOTH 0x04=0x01');
  });

  it('displays the correct command written to the CMD characteristic', async () => {
    const device = createFakeWM8741Device();
    installFakeBluetooth({ nextDevice: device });

    const client = new WM8741BLEClient();
    await client.connect();

    const service = device.gattServer.services.get(DEFAULT_SERVICE_UUID.toLowerCase())!;
    const cmdCharacteristic = service.characteristics.get(DEFAULT_CMD_CHARACTERISTIC_UUID.toLowerCase())!;
    const respCharacteristic = service.characteristics.get(DEFAULT_RESP_CHARACTERISTIC_UUID.toLowerCase())!;

    const promise = client.writeRegister(0x04, 0x01);
    setTimeout(() => respCharacteristic.dispatchResponse('OK Reg BOTH 0x04=0x01'), 10);
    await promise;

    const written = cmdCharacteristic.getWrittenValues();
    expect(written.length).toBe(1);
    expect(new TextDecoder().decode(written[0])).toBe('SET_REG 04 01\n');
  });
});

function createFakeWM8741Device(): FakeBluetoothDevice {
  const device = new FakeBluetoothDevice('fake-id', 'WM8741_DAC');
  const service = device.addService(DEFAULT_SERVICE_UUID);
  service.addCharacteristic(DEFAULT_CMD_CHARACTERISTIC_UUID);
  service.addCharacteristic(DEFAULT_RESP_CHARACTERISTIC_UUID);
  return device;
}
