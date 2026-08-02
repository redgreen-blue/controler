import { FakeBluetoothDevice } from './fake-gatt.js';

export interface FakeBluetoothOptions {
  devices?: FakeBluetoothDevice[];
  nextDevice?: FakeBluetoothDevice;
  shouldReject?: boolean;
  rejectError?: Error;
}

/**
 * Installs a mock `navigator.bluetooth` for the duration of a test.
 *
 * Returns a controller to manipulate the mock and restore the original state.
 */
export function installFakeBluetooth(options: FakeBluetoothOptions = {}): FakeBluetoothController {
  const controller = new FakeBluetoothController(options);

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      ...(globalThis.navigator as object),
      bluetooth: controller.asNavigatorBluetooth()
    },
    configurable: true,
    writable: true
  });

  return controller;
}

export class FakeBluetoothController {
  private devices: FakeBluetoothDevice[] = [];
  private nextDevice?: FakeBluetoothDevice;
  private shouldReject = false;
  private rejectError?: Error;
  private requestOptions: RequestDeviceOptions[] = [];

  constructor(options: FakeBluetoothOptions = {}) {
    if (options.devices) {
      this.devices.push(...options.devices);
    }
    this.nextDevice = options.nextDevice;
    this.shouldReject = options.shouldReject ?? false;
    this.rejectError = options.rejectError;
  }

  addDevice(device: FakeBluetoothDevice): void {
    this.devices.push(device);
  }

  setNextDevice(device: FakeBluetoothDevice): void {
    this.nextDevice = device;
  }

  setShouldReject(error?: Error): void {
    this.shouldReject = true;
    this.rejectError = error ?? new Error('User cancelled');
  }

  getRequestedOptions(): RequestDeviceOptions[] {
    return this.requestOptions;
  }

  asNavigatorBluetooth(): Bluetooth {
    const self = this;
    return {
      getAvailability: async () => true,
      requestDevice: async (options?: RequestDeviceOptions) => {
        self.requestOptions.push(options ?? { acceptAllDevices: true });
        if (self.shouldReject) {
          throw self.rejectError ?? new Error('User cancelled the requestDevice() chooser.');
        }
        if (self.nextDevice) {
          const device = self.nextDevice;
          self.nextDevice = undefined;
          return device.asBluetoothDevice();
        }
        if (self.devices.length > 0) {
          return self.devices[0].asBluetoothDevice();
        }
        throw new Error('No fake Bluetooth device available');
      },
      // Deprecated property stubs to satisfy the type.
      referringDevice: undefined as unknown as BluetoothDevice,
      requestLEScan: async () => {
        throw new Error('requestLEScan not implemented in fake');
      }
    } as unknown as Bluetooth;
  }

  restore(): void {
    // No-op; restoration is handled by the caller if needed.
  }
}

/**
 * Remove the mock `navigator.bluetooth` after a test.
 */
export function uninstallFakeBluetooth(): void {
  // Best-effort cleanup. Vitest isolates globals per test file by default.
  if ('navigator' in globalThis) {
    const nav = globalThis.navigator as { bluetooth?: Bluetooth };
    delete nav.bluetooth;
  }
}
