/**
 * Minimal fake implementations of Web Bluetooth GATT objects for unit tests.
 */

export class FakeBluetoothRemoteGATTCharacteristic extends EventTarget {
  service: FakeBluetoothRemoteGATTService;
  uuid: string;
  value: DataView | undefined = undefined;
  private notifying = false;
  private writtenValues: ArrayBuffer[] = [];

  constructor(service: FakeBluetoothRemoteGATTService, uuid: string) {
    super();
    this.service = service;
    this.uuid = uuid;
  }

  async readValue(): Promise<DataView> {
    return this.value ?? new DataView(new ArrayBuffer(0));
  }

  async writeValue(value: BufferSource): Promise<void> {
    let buffer: ArrayBuffer;
    if (value instanceof ArrayBuffer) {
      buffer = value;
    } else if ('buffer' in value) {
      buffer = (value as { buffer: ArrayBuffer }).buffer;
    } else {
      buffer = value as ArrayBuffer;
    }
    this.writtenValues.push(buffer.slice(0));
  }

  async writeValueWithoutResponse(value: BufferSource): Promise<void> {
    return this.writeValue(value);
  }

  async startNotifications(): Promise<FakeBluetoothRemoteGATTCharacteristic> {
    this.notifying = true;
    return this;
  }

  async stopNotifications(): Promise<FakeBluetoothRemoteGATTCharacteristic> {
    this.notifying = false;
    return this;
  }

  isNotifying(): boolean {
    return this.notifying;
  }

  getWrittenValues(): ArrayBuffer[] {
    return this.writtenValues;
  }

  dispatchResponse(text: string): void {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text);
    this.value = new DataView(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }

  // Expose as the real DOM type for casting.
  asBluetoothCharacteristic(): BluetoothRemoteGATTCharacteristic {
    return this as unknown as BluetoothRemoteGATTCharacteristic;
  }
}

export class FakeBluetoothRemoteGATTService extends EventTarget {
  device: FakeBluetoothDevice;
  uuid: string;
  characteristics = new Map<string, FakeBluetoothRemoteGATTCharacteristic>();

  constructor(device: FakeBluetoothDevice, uuid: string) {
    super();
    this.device = device;
    this.uuid = uuid;
  }

  addCharacteristic(uuid: string): FakeBluetoothRemoteGATTCharacteristic {
    const characteristic = new FakeBluetoothRemoteGATTCharacteristic(this, uuid);
    this.characteristics.set(uuid.toLowerCase(), characteristic);
    return characteristic;
  }

  async getCharacteristic(uuid: string): Promise<FakeBluetoothRemoteGATTCharacteristic> {
    const characteristic = this.characteristics.get(uuid.toLowerCase());
    if (!characteristic) {
      throw new Error(`Characteristic ${uuid} not found`);
    }
    return characteristic;
  }

  asBluetoothService(): BluetoothRemoteGATTService {
    return this as unknown as BluetoothRemoteGATTService;
  }
}

export class FakeBluetoothRemoteGATTServer extends EventTarget {
  device: FakeBluetoothDevice;
  connected = false;
  services = new Map<string, FakeBluetoothRemoteGATTService>();

  constructor(device: FakeBluetoothDevice) {
    super();
    this.device = device;
  }

  addService(uuid: string): FakeBluetoothRemoteGATTService {
    const service = new FakeBluetoothRemoteGATTService(this.device, uuid);
    this.services.set(uuid.toLowerCase(), service);
    return service;
  }

  async connect(): Promise<FakeBluetoothRemoteGATTServer> {
    this.connected = true;
    this.device.setConnected(true);
    return this;
  }

  disconnect(): void {
    this.connected = false;
    this.device.setConnected(false);
  }

  async getPrimaryService(uuid: string): Promise<FakeBluetoothRemoteGATTService> {
    const service = this.services.get(uuid.toLowerCase());
    if (!service) {
      throw new Error(`Service ${uuid} not found`);
    }
    return service;
  }

  asBluetoothServer(): BluetoothRemoteGATTServer {
    return this as unknown as BluetoothRemoteGATTServer;
  }
}

export class FakeBluetoothDevice extends EventTarget {
  id: string;
  name: string | null;
  private server: FakeBluetoothRemoteGATTServer;
  private _gatt: BluetoothRemoteGATTServer;

  constructor(id: string, name: string | null) {
    super();
    this.id = id;
    this.name = name;
    this.server = new FakeBluetoothRemoteGATTServer(this);
    this._gatt = this.server.asBluetoothServer();
  }

  get gatt(): BluetoothRemoteGATTServer {
    return this._gatt;
  }

  get gattServer(): FakeBluetoothRemoteGATTServer {
    return this.server;
  }

  addService(uuid: string): FakeBluetoothRemoteGATTService {
    return this.server.addService(uuid);
  }

  setConnected(connected: boolean): void {
    if (!connected) {
      this.dispatchEvent(new Event('gattserverdisconnected'));
    }
  }

  asBluetoothDevice(): BluetoothDevice {
    return this as unknown as BluetoothDevice;
  }
}
