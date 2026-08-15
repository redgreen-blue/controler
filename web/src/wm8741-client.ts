import {
  DEFAULT_SERVICE_UUID,
  DEFAULT_CMD_CHARACTERISTIC_UUID,
  DEFAULT_RESP_CHARACTERISTIC_UUID,
  DEFAULT_DEVICE_NAME,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_MAX_RECONNECT_ATTEMPTS,
  DEFAULT_RECONNECT_BASE_DELAY_MS,
  DEFAULT_RECONNECT_MAX_DELAY_MS,
} from './constants.js';
import {
  NotSupportedError,
  ConnectionError,
  ConnectionTimeoutError,
  StateError,
  ProtocolError
} from './errors.js';
import { ConnectionStateMachine } from './state-machine.js';
import { DeviceManager } from './device-manager.js';
import { GATTManager } from './gatt-manager.js';
import { CommandProtocol, WM8741Channel } from './protocol.js';
import {
  WM8741BLEClientOptions,
  ScanOptions,
  BluetoothDeviceInfo,
  CommandOptions,
  ConnectionState,
  StateChangeEvent,
  DisconnectEvent,
  ResponseEvent
} from './types.js';

interface PendingCommand {
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * High-level client for controlling a WM8741 DAC over Web Bluetooth.
 *
 * The client manages device scanning, GATT connection, service discovery,
 * command/response messaging, automatic reconnection, and connection state.
 */
export class WM8741BLEClient extends EventTarget {
  private options: Required<WM8741BLEClientOptions>;
  private stateMachine = new ConnectionStateMachine();
  private deviceManager = new DeviceManager();
  private gattManager = new GATTManager();

  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private cmdCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private respCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

  private pendingCommands = new Map<string, PendingCommand>();
  private commandQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectHandler = this.onGattDisconnected.bind(this);
  private responseHandler = this.onCharacteristicValueChanged.bind(this);

  constructor(options: WM8741BLEClientOptions = {}) {
    super();
    this.options = {
      serviceUuid: options.serviceUuid ?? DEFAULT_SERVICE_UUID,
      cmdCharacteristicUuid: options.cmdCharacteristicUuid ?? DEFAULT_CMD_CHARACTERISTIC_UUID,
      respCharacteristicUuid: options.respCharacteristicUuid ?? DEFAULT_RESP_CHARACTERISTIC_UUID,
      deviceName: options.deviceName ?? DEFAULT_DEVICE_NAME,
      commandTimeoutMs: options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      maxReconnectAttempts: options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
      reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS,
      reconnectMaxDelayMs: options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS
    };

    this.stateMachine.addEventListener('statechange', (event) => {
      const detail = (event as CustomEvent).detail;
      this.dispatchEvent(
        new StateChangeEvent(detail.to, detail.from, detail.reason)
      );
    });
  }

  /** Current connection state. */
  get state(): ConnectionState {
    return this.stateMachine.state;
  }

  /** Whether the GATT server is currently connected. */
  get isConnected(): boolean {
    return this.stateMachine.state === 'connected';
  }

  /** Name of the connected device, if any. */
  get deviceName(): string | null {
    return this.device?.name ?? null;
  }

  /**
   * Scan for a Bluetooth device.
   *
   * @returns Simplified device info for the selected device.
   */
  async scan(scanOptions: ScanOptions = {}): Promise<BluetoothDeviceInfo> {
    this.ensureSupported();

    if (!this.stateMachine.canTransition('scanning')) {
      throw new StateError('Cannot scan while in state ' + this.stateMachine.state);
    }

    this.stateMachine.transition('scanning', 'user initiated scan');

    try {
      const options: ScanOptions = {
        serviceUuid: this.options.serviceUuid,
        ...scanOptions
      };

      if (!options.name && !options.filters && !options.acceptAllDevices) {
        options.name = this.options.deviceName;
      }

      const device = await this.deviceManager.requestDevice(options);
      this.device = device;

      const info: BluetoothDeviceInfo = {
        id: device.id,
        name: device.name ?? null
      };

      this.stateMachine.transition('idle', `selected device ${info.name ?? info.id}`);
      return info;
    } catch (err) {
      this.stateMachine.transition('idle', 'scan failed');
      throw err;
    }
  }

  /**
   * Connect to a Bluetooth device.
   *
   * If `deviceInfo` is omitted, a scan dialog will be shown first.
   */
  async connect(deviceInfo?: BluetoothDeviceInfo): Promise<void> {
    this.ensureSupported();

    if (this.isConnected) {
      return;
    }

    if (!this.stateMachine.canTransition('connecting')) {
      throw new StateError('Cannot connect while in state ' + this.stateMachine.state);
    }

    this.cancelReconnect();

    // Acquire a BluetoothDevice first if we do not already have one.
    // Scan transitions through its own states, so it must happen before
    // we enter the 'connecting' state.
    if (deviceInfo) {
      // Re-connect by device info is not directly supported by Web Bluetooth API;
      // the caller should keep the BluetoothDevice reference. We fall back to scan.
      await this.scan({ name: deviceInfo.name ?? undefined });
    } else if (!this.device) {
      await this.scan();
    }

    this.stateMachine.transition('connecting', 'user initiated connection');

    try {
      this.server = await this.deviceManager.connectGatt(this.device!);
      this.device!.addEventListener('gattserverdisconnected', this.disconnectHandler);

      this.stateMachine.transition('discovering-services', 'GATT connected');

      const service = await this.gattManager.getPrimaryService(
        this.server,
        this.options.serviceUuid
      ).catch((err) => {
        throw new ConnectionError(
          `Service ${this.options.serviceUuid} not found on the device. ` +
          'Please verify that the ESP32 GATT server has started and that the UUID matches.',
          err
        );
      });

      const characteristics = await this.gattManager.getCharacteristics(service, [
        this.options.cmdCharacteristicUuid,
        this.options.respCharacteristicUuid
      ]);

      this.cmdCharacteristic = characteristics.get(
        this.normalizeUuid(this.options.cmdCharacteristicUuid)
      ) ?? null;
      this.respCharacteristic = characteristics.get(
        this.normalizeUuid(this.options.respCharacteristicUuid)
      ) ?? null;

      if (!this.cmdCharacteristic || !this.respCharacteristic) {
        throw new ConnectionError('Required GATT characteristics not found');
      }

      await this.gattManager.startNotifications(
        this.respCharacteristic,
        this.responseHandler
      );

      this.reconnectAttempts = 0;
      this.stateMachine.transition('connected', 'service discovery complete');
    } catch (err) {
      await this.cleanup(false);
      this.stateMachine.transition('disconnected', `connection failed: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Disconnect from the device and cancel any pending reconnect.
   */
  async disconnect(): Promise<void> {
    if (this.stateMachine.state === 'idle' || this.stateMachine.state === 'disconnected') {
      return;
    }

    this.cancelReconnect();
    this.stateMachine.transition('disconnecting', 'user initiated disconnect');
    await this.cleanup(true);
    this.stateMachine.transition('disconnected', 'disconnected by user');
  }

  /**
   * Send a raw text command and wait for a response notification.
   */
  async sendCommand(cmd: string, options: CommandOptions = {}): Promise<string> {
    if (!this.isConnected || !this.cmdCharacteristic) {
      throw new StateError('Not connected');
    }

    const timeoutMs = options.timeoutMs ?? this.options.commandTimeoutMs;
    const requestId = this.generateRequestId();

    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingCommands.delete(requestId);
        reject(new ConnectionTimeoutError(`Command "${cmd}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingCommands.set(requestId, { resolve, reject, timeoutId });

      this.enqueueCommand(async () => {
        try {
          const data = CommandProtocol.encodeCommand(cmd);
          await this.gattManager.writeValue(this.cmdCharacteristic!, data);
        } catch (err) {
          const pending = this.pendingCommands.get(requestId);
          if (pending) {
            clearTimeout(pending.timeoutId);
            this.pendingCommands.delete(requestId);
            pending.reject(err as Error);
          }
        }
      });
    });
  }

  // ===== WM8741 high-level commands =====

  async setVolume(steps: number, channel: WM8741Channel = 'both'): Promise<string> {
    CommandProtocol.validateVolume(steps);
    return this.sendCommand(
      CommandProtocol.buildChannelArgs('VOLUME', channel, String(steps))
    );
  }

  async setFilter(response: 1 | 2 | 3 | 4 | 5, channel: WM8741Channel = 'both'): Promise<string> {
    CommandProtocol.validateFilter(response);
    return this.sendCommand(
      CommandProtocol.buildChannelArgs('FILTER', channel, String(response))
    );
  }

  async setMute(enable: boolean, channel: WM8741Channel = 'both'): Promise<string> {
    return this.sendCommand(
      CommandProtocol.buildChannelArgs('MUTE', channel, enable ? '1' : '0')
    );
  }

  async setVolumeRamp(enable: boolean, channel: WM8741Channel = 'both'): Promise<string> {
    return this.sendCommand(
      CommandProtocol.buildChannelArgs('SET_REG', channel, `04 ${enable ? '01' : '00'}`)
    );
  }

  async setAntiClip(enable: boolean, channel: WM8741Channel = 'both'): Promise<string> {
    return this.sendCommand(
      CommandProtocol.buildChannelArgs('ANTICLIP', channel, enable ? '1' : '0')
    );
  }

  async reset(channel: WM8741Channel = 'both'): Promise<string> {
    return this.sendCommand(
      CommandProtocol.buildChannelArgs('RESET', channel, '')
    );
  }

  async writeRegister(reg: number, value: number, channel: WM8741Channel = 'both'): Promise<string> {
    CommandProtocol.validateRegister(reg, value);
    const regHex = reg.toString(16).padStart(2, '0');
    const valHex = value.toString(16).padStart(2, '0');
    return this.sendCommand(
      CommandProtocol.buildChannelArgs('SET_REG', channel, `${regHex} ${valHex}`)
    );
  }

  async setAttenuation(atten: number, channel: WM8741Channel = 'both'): Promise<string> {
    if (!Number.isInteger(atten) || atten < 0 || atten > 1023) {
      throw new ProtocolError('Attenuation must be an integer between 0 and 1023');
    }
    return this.sendCommand(
      CommandProtocol.buildChannelArgs('ATTEN', channel, String(atten))
    );
  }

  async setDeEmphasis(mode: 0 | 1 | 2 | 3, channel: WM8741Channel = 'both'): Promise<string> {
    if (!Number.isInteger(mode) || mode < 0 || mode > 3) {
      throw new ProtocolError('De-emphasis mode must be 0, 1, 2, or 3');
    }
    return this.sendCommand(
      CommandProtocol.buildChannelArgs('DEEMPH', channel, String(mode))
    );
  }

  /**
   * Set the input audio format of the WM8741.
   *
   * `format` values: 0 = Right Justified, 1 = Left Justified, 2 = I2S, 3 = DSP.
   * `wordLength` values: 0 = 16-bit, 1 = 20-bit, 2 = 24-bit, 3 = 32-bit.
   */
  async setFormat(format: number, wordLength: number, channel: WM8741Channel = 'both'): Promise<string> {
    CommandProtocol.validateFormat(format, wordLength);
    return this.sendCommand(
      CommandProtocol.buildChannelArgs('FORMAT', channel, `${format} ${wordLength}`)
    );
  }

  // ===== Event helpers =====

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    super.addEventListener(type, listener, options);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void {
    super.removeEventListener(type, listener, options);
  }

  // ===== Private helpers =====

  private ensureSupported(): void {
    if (!DeviceManager.isSupported()) {
      throw new NotSupportedError();
    }
  }

  private normalizeUuid(uuid: string | number): string {
    return uuid.toString().toLowerCase();
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private enqueueCommand(command: () => Promise<void>): void {
    this.commandQueue.push(command);
    if (!this.isProcessingQueue) {
      void this.processCommandQueue();
    }
  }

  private async processCommandQueue(): Promise<void> {
    this.isProcessingQueue = true;
    while (this.commandQueue.length > 0) {
      const command = this.commandQueue.shift();
      if (command) {
        try {
          await command();
        } catch {
          // Errors are already handled by the command's own reject.
        }
      }
    }
    this.isProcessingQueue = false;
  }

  private onCharacteristicValueChanged(event: Event): Promise<void> | void {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const response = CommandProtocol.decodeResponse(target.value);

    this.dispatchEvent(new ResponseEvent(response));

    // Resolve the oldest pending command. The WM8741 firmware returns one
    // response line per command, so FIFO matching is sufficient.
    const oldestEntry = this.pendingCommands.entries().next().value;
    if (oldestEntry) {
      const [requestId, pending] = oldestEntry as [string, PendingCommand];
      clearTimeout(pending.timeoutId);
      this.pendingCommands.delete(requestId);
      pending.resolve(response);
    }
  }

  private onGattDisconnected(): void {
    const wasConnected = this.isConnected;
    this.cleanup(false).catch(() => {
      // ignore cleanup errors during disconnect
    });

    this.dispatchEvent(new DisconnectEvent(wasConnected));

    if (wasConnected && this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.stateMachine.transition('disconnected', 'GATT server disconnected');
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts += 1;
    const delay = Math.min(
      this.options.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts - 1),
      this.options.reconnectMaxDelayMs
    );

    this.stateMachine.transition('reconnecting', `attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts}`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.stateMachine.transition('connecting', 'automatic reconnect');
      this.connect()
        .then(() => {
          this.reconnectAttempts = 0;
        })
        .catch(() => {
          if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
            this.scheduleReconnect();
          } else {
            this.stateMachine.transition('disconnected', 'max reconnect attempts reached');
          }
        });
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  private async cleanup(userInitiated: boolean): Promise<void> {
    this.cancelReconnect();

    // Reject all pending commands.
    for (const [requestId, pending] of this.pendingCommands) {
      clearTimeout(pending.timeoutId);
      pending.reject(
        userInitiated
          ? new ConnectionError('Disconnected by user')
          : new ConnectionError('Connection lost')
      );
      this.pendingCommands.delete(requestId);
    }
    this.commandQueue = [];

    if (this.respCharacteristic) {
      await this.gattManager.stopNotifications(
        this.respCharacteristic,
        this.responseHandler
      );
      this.respCharacteristic = null;
    }

    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.disconnectHandler);
    }

    if (this.server && this.server.connected) {
      try {
        this.server.disconnect();
      } catch {
        // best-effort
      }
    }

    this.cmdCharacteristic = null;
    this.server = null;
    if (userInitiated) {
      this.device = null;
    }
  }
}

// Required for TypeScript custom event map declaration merging.
export interface WM8741BLEClientEventMap {
  statechange: StateChangeEvent;
  disconnect: DisconnectEvent;
  response: ResponseEvent;
  error: ErrorEvent;
}
