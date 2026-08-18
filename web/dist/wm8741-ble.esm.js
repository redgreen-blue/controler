const C = "00001234-0000-1000-8000-00805f9b34fb".toLowerCase(), T = "00001235-0000-1000-8000-00805f9b34fb".toLowerCase(), E = "00001236-0000-1000-8000-00805f9b34fb".toLowerCase(), M = "WM8741_DAC", y = 3e3, A = 5, S = 1e3, R = 3e4;
class h extends Error {
  constructor(e, t, n) {
    super(e), this.code = t, this.cause = n, this.name = "BLEError";
  }
}
class f extends h {
  constructor(e = "Web Bluetooth is not supported in this browser or context") {
    super(e, "NOT_SUPPORTED"), this.name = "NotSupportedError";
  }
}
class D extends h {
  constructor(e = "Bluetooth pairing or connection was denied", t) {
    super(e, "SECURITY", t), this.name = "SecurityError";
  }
}
class o extends h {
  constructor(e = "Bluetooth connection failed", t) {
    super(e, "CONNECTION", t), this.name = "ConnectionError";
  }
}
class U extends h {
  constructor(e = "Bluetooth operation timed out") {
    super(e, "TIMEOUT"), this.name = "ConnectionTimeoutError";
  }
}
class d extends h {
  constructor(e = "GATT operation failed", t) {
    super(e, "GATT", t), this.name = "GATTError";
  }
}
class m extends h {
  constructor(e = "Protocol error") {
    super(e, "PROTOCOL"), this.name = "ProtocolError";
  }
}
class p extends h {
  constructor(e = "Invalid operation for current connection state") {
    super(e, "INVALID_STATE"), this.name = "StateError";
  }
}
const x = {
  idle: ["scanning", "connecting", "disconnected"],
  scanning: ["idle", "connecting", "disconnected"],
  connecting: ["discovering-services", "disconnected", "reconnecting"],
  "discovering-services": ["connected", "disconnected", "reconnecting"],
  connected: ["disconnecting", "disconnected", "reconnecting"],
  disconnecting: ["disconnected", "idle"],
  disconnected: ["idle", "connecting"],
  reconnecting: ["connecting", "disconnected", "idle"]
};
class b extends EventTarget {
  constructor() {
    super(...arguments), this._state = "idle";
  }
  get state() {
    return this._state;
  }
  get lastReason() {
    return this._lastReason;
  }
  /**
   * Attempt to transition to a new state.
   *
   * @throws {StateError} if the transition is not allowed.
   */
  transition(e, t) {
    if (!this.canTransition(e))
      throw new p(
        `Invalid state transition from "${this._state}" to "${e}"${t ? ` (${t})` : ""}`
      );
    const n = this._state;
    this._state = e, this._lastReason = t, this.dispatchEvent(
      new CustomEvent("statechange", {
        detail: { from: n, to: e, reason: t }
      })
    );
  }
  /**
   * Check whether a transition to the target state is allowed.
   */
  canTransition(e) {
    return x[this._state].includes(e);
  }
  /**
   * Reset the machine back to `idle`.
   */
  reset() {
    this._state = "idle", this._lastReason = void 0;
  }
}
class g {
  /**
   * Verify that Web Bluetooth is available in the current browsing context.
   */
  static isSupported() {
    var e;
    return typeof navigator < "u" && "bluetooth" in navigator && typeof ((e = navigator.bluetooth) == null ? void 0 : e.requestDevice) == "function";
  }
  /**
   * Build Web Bluetooth `requestDevice` options from our `ScanOptions`.
   */
  buildRequestOptions(e) {
    if (e.acceptAllDevices)
      return {
        acceptAllDevices: !0,
        optionalServices: e.serviceUuid ? [e.serviceUuid] : void 0
      };
    const t = [];
    return e.filters && e.filters.length > 0 && t.push(...e.filters), e.name && t.push({ name: e.name }), t.length === 0 ? {
      acceptAllDevices: !0,
      optionalServices: e.serviceUuid ? [e.serviceUuid] : void 0
    } : {
      filters: t,
      optionalServices: e.serviceUuid ? [e.serviceUuid] : void 0
    };
  }
  /**
   * Scan for and request a single Bluetooth device from the user.
   *
   * @returns The selected `BluetoothDevice`.
   */
  async requestDevice(e = {}) {
    if (!g.isSupported())
      throw new f(
        "Web Bluetooth is not supported. Please use Chrome, Edge, or another Chromium-based browser, and ensure the page is loaded over HTTPS or localhost."
      );
    try {
      const t = this.buildRequestOptions(e);
      return await navigator.bluetooth.requestDevice(t);
    } catch (t) {
      const n = t;
      throw n.name === "NotFoundError" || n.name === "SecurityError" ? new D(
        "Bluetooth device selection was cancelled or denied by the user.",
        n
      ) : new o(`Failed to request Bluetooth device: ${n.message}`, n);
    }
  }
  /**
   * Request a device and return simplified device information.
   */
  async scan(e = {}) {
    const t = await this.requestDevice(e);
    return {
      id: t.id,
      name: t.name ?? null
    };
  }
  /**
   * Connect to the GATT server of a previously selected device.
   */
  async connectGatt(e) {
    if (!e.gatt)
      throw new o("Bluetooth device does not expose a GATT server");
    try {
      return await e.gatt.connect();
    } catch (t) {
      const n = t;
      throw new o(`Failed to connect to GATT server: ${n.message}`, n);
    }
  }
}
class I {
  /**
   * Discover a primary service by UUID.
   */
  async getPrimaryService(e, t) {
    try {
      return await e.getPrimaryService(t);
    } catch (n) {
      const s = n;
      throw new d(`Service ${t} not found: ${s.message}`, s);
    }
  }
  /**
   * Discover multiple characteristics on a service.
   */
  async getCharacteristics(e, t) {
    const n = /* @__PURE__ */ new Map();
    for (const s of t) {
      const r = typeof s == "number" ? s.toString(16) : s.toString();
      try {
        const c = await e.getCharacteristic(s);
        n.set(r.toLowerCase(), c);
      } catch (c) {
        const l = c;
        throw new d(`Characteristic ${s} not found: ${l.message}`, l);
      }
    }
    return n;
  }
  /**
   * Read the value of a characteristic and return the underlying `DataView`.
   */
  async readValue(e) {
    try {
      return await e.readValue();
    } catch (t) {
      const n = t;
      throw new d(`Failed to read characteristic: ${n.message}`, n);
    }
  }
  /**
   * Write a raw buffer to a characteristic.
   */
  async writeValue(e, t) {
    try {
      await e.writeValue(t);
    } catch (n) {
      const s = n;
      throw new d(`Failed to write characteristic: ${s.message}`, s);
    }
  }
  /**
   * Write without response when supported.
   */
  async writeValueWithoutResponse(e, t) {
    try {
      await e.writeValueWithoutResponse(t);
    } catch (n) {
      const s = n;
      throw new d(
        `Failed to write characteristic without response: ${s.message}`,
        s
      );
    }
  }
  /**
   * Subscribe to value-changed notifications on a characteristic.
   */
  async startNotifications(e, t) {
    try {
      e.addEventListener("characteristicvaluechanged", t), await e.startNotifications();
    } catch (n) {
      e.removeEventListener("characteristicvaluechanged", t);
      const s = n;
      throw new d(`Failed to start notifications: ${s.message}`, s);
    }
  }
  /**
   * Unsubscribe from notifications.
   */
  async stopNotifications(e, t) {
    try {
      await e.stopNotifications();
    } catch {
    } finally {
      e.removeEventListener("characteristicvaluechanged", t);
    }
  }
}
const a = class a {
  /**
   * Encode a text command into a Uint8Array, appending a newline if absent.
   */
  static encodeCommand(e) {
    const t = e.endsWith(`
`) ? e : `${e}
`;
    return a.textEncoder.encode(t);
  }
  /**
   * Decode a DataView/ArrayBuffer into a UTF-8 string.
   */
  static decodeResponse(e) {
    return e ? e instanceof DataView ? a.textDecoder.decode(e.buffer.slice(e.byteOffset, e.byteOffset + e.byteLength)) : a.textDecoder.decode(e) : "";
  }
  /**
   * Convert a Uint8Array to a lowercase hex string.
   */
  static bytesToHex(e) {
    return Array.from(e).map((t) => t.toString(16).padStart(2, "0")).join("");
  }
  /**
   * Convert a hex string to a Uint8Array.
   *
   * @throws {ProtocolError} if the string is not valid hex.
   */
  static hexToBytes(e) {
    const t = e.replace(/\s+/g, "");
    if (t.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(t))
      throw new m(`Invalid hex string: ${e}`);
    const n = new Uint8Array(t.length / 2);
    for (let s = 0; s < t.length; s += 2)
      n[s / 2] = parseInt(t.substring(s, s + 2), 16);
    return n;
  }
  /**
   * Parse a register-write response such as `OK Reg BOTH 0x04=0x01`.
   *
   * The optional channel prefix (LEFT/RIGHT/BOTH) is accepted so responses
   * from dual-WM8741 configurations are parsed correctly.
   *
   * @returns The parsed register and value, or null if not matched.
   */
  static parseRegisterResponse(e) {
    const t = /OK Reg (?:LEFT |RIGHT |BOTH )?0x([0-9a-fA-F]+)=0x([0-9a-fA-F]+)/.exec(e);
    return t ? {
      reg: parseInt(t[1], 16),
      value: parseInt(t[2], 16)
    } : null;
  }
  /**
   * Validate an 8-bit register address and value.
   *
   * @throws {ProtocolError} if out of range.
   */
  static validateRegister(e, t) {
    if (!Number.isInteger(e) || e < 0 || e > 127)
      throw new m("Register address must be between 0 and 0x7F");
    if (!Number.isInteger(t) || t < 0 || t > 255)
      throw new m("Register value must be between 0 and 0xFF");
  }
  /**
   * Validate a channel target for dual-WM8741 configurations.
   *
   * @throws {ProtocolError} if invalid.
   */
  static validateChannel(e) {
    if (!["both", "left", "right"].includes(e))
      throw new m("Channel must be both, left, or right");
  }
  /**
   * Format a command argument that optionally includes a channel specifier.
   *
   * @example
   *   buildChannelArgs('RESET', 'both', '')     -> 'RESET'
   *   buildChannelArgs('RESET', 'left', '')     -> 'RESET LEFT'
   *   buildChannelArgs('VOLUME', 'left', '50')  -> 'VOLUME LEFT 50'
   *   buildChannelArgs('VOLUME', 'both', '50')  -> 'VOLUME 50'
   *   buildChannelArgs('SET_REG', 'left', '04 01') -> 'SET_REG LEFT 04 01'
   */
  static buildChannelArgs(e, t, n) {
    a.validateChannel(t);
    const s = t === "both" ? "" : ` ${t.toUpperCase()}`, r = n ? ` ${n}` : "";
    return `${e}${s}${r}`;
  }
};
a.textEncoder = new TextEncoder(), a.textDecoder = new TextDecoder("utf-8");
let u = a;
class L extends Event {
  constructor(e, t, n) {
    super("statechange"), this.state = e, this.previousState = t, this.reason = n;
  }
}
class $ extends Event {
  constructor(e) {
    super("disconnect"), this.unexpected = e;
  }
}
class _ extends Event {
  constructor(e) {
    super("response"), this.response = e;
  }
}
class N extends EventTarget {
  constructor(e = {}) {
    super(), this.stateMachine = new b(), this.deviceManager = new g(), this.gattManager = new I(), this.device = null, this.server = null, this.cmdCharacteristic = null, this.respCharacteristic = null, this.pendingCommands = /* @__PURE__ */ new Map(), this.commandQueue = [], this.isProcessingQueue = !1, this.reconnectAttempts = 0, this.reconnectTimer = null, this.disconnectHandler = this.onGattDisconnected.bind(this), this.responseHandler = this.onCharacteristicValueChanged.bind(this), this.options = {
      serviceUuid: e.serviceUuid ?? C,
      cmdCharacteristicUuid: e.cmdCharacteristicUuid ?? T,
      respCharacteristicUuid: e.respCharacteristicUuid ?? E,
      deviceName: e.deviceName ?? M,
      commandTimeoutMs: e.commandTimeoutMs ?? y,
      maxReconnectAttempts: e.maxReconnectAttempts ?? A,
      reconnectBaseDelayMs: e.reconnectBaseDelayMs ?? S,
      reconnectMaxDelayMs: e.reconnectMaxDelayMs ?? R
    }, this.stateMachine.addEventListener("statechange", (t) => {
      const n = t.detail;
      this.dispatchEvent(
        new L(n.to, n.from, n.reason)
      );
    });
  }
  /** Current connection state. */
  get state() {
    return this.stateMachine.state;
  }
  /** Whether the GATT server is currently connected. */
  get isConnected() {
    return this.stateMachine.state === "connected";
  }
  /** Name of the connected device, if any. */
  get deviceName() {
    var e;
    return ((e = this.device) == null ? void 0 : e.name) ?? null;
  }
  /**
   * Scan for a Bluetooth device.
   *
   * @returns Simplified device info for the selected device.
   */
  async scan(e = {}) {
    if (this.ensureSupported(), !this.stateMachine.canTransition("scanning"))
      throw new p("Cannot scan while in state " + this.stateMachine.state);
    this.stateMachine.transition("scanning", "user initiated scan");
    try {
      const t = {
        serviceUuid: this.options.serviceUuid,
        ...e
      };
      !t.name && !t.filters && !t.acceptAllDevices && (t.name = this.options.deviceName);
      const n = await this.deviceManager.requestDevice(t);
      this.device = n;
      const s = {
        id: n.id,
        name: n.name ?? null
      };
      return this.stateMachine.transition("idle", `selected device ${s.name ?? s.id}`), s;
    } catch (t) {
      throw this.stateMachine.transition("idle", "scan failed"), t;
    }
  }
  /**
   * Connect to a Bluetooth device.
   *
   * If `deviceInfo` is omitted, a scan dialog will be shown first.
   */
  async connect(e) {
    if (this.ensureSupported(), !this.isConnected) {
      if (!this.stateMachine.canTransition("connecting"))
        throw new p("Cannot connect while in state " + this.stateMachine.state);
      this.cancelReconnect(), e ? await this.scan({ name: e.name ?? void 0 }) : this.device || await this.scan(), this.stateMachine.transition("connecting", "user initiated connection");
      try {
        this.server = await this.deviceManager.connectGatt(this.device), this.device.addEventListener("gattserverdisconnected", this.disconnectHandler), this.stateMachine.transition("discovering-services", "GATT connected");
        const t = await this.gattManager.getPrimaryService(
          this.server,
          this.options.serviceUuid
        ).catch((s) => {
          throw new o(
            `Service ${this.options.serviceUuid} not found on the device. Please verify that the ESP32 GATT server has started and that the UUID matches.`,
            s
          );
        }), n = await this.gattManager.getCharacteristics(t, [
          this.options.cmdCharacteristicUuid,
          this.options.respCharacteristicUuid
        ]);
        if (this.cmdCharacteristic = n.get(
          this.normalizeUuid(this.options.cmdCharacteristicUuid)
        ) ?? null, this.respCharacteristic = n.get(
          this.normalizeUuid(this.options.respCharacteristicUuid)
        ) ?? null, !this.cmdCharacteristic || !this.respCharacteristic)
          throw new o("Required GATT characteristics not found");
        await this.gattManager.startNotifications(
          this.respCharacteristic,
          this.responseHandler
        ), this.reconnectAttempts = 0, this.stateMachine.transition("connected", "service discovery complete");
      } catch (t) {
        throw await this.cleanup(!1), this.stateMachine.transition("disconnected", `connection failed: ${t.message}`), t;
      }
    }
  }
  /**
   * Disconnect from the device and cancel any pending reconnect.
   */
  async disconnect() {
    this.stateMachine.state === "idle" || this.stateMachine.state === "disconnected" || (this.cancelReconnect(), this.stateMachine.transition("disconnecting", "user initiated disconnect"), await this.cleanup(!0), this.stateMachine.transition("disconnected", "disconnected by user"));
  }
  /**
   * Send a raw text command and wait for a response notification.
   */
  async sendCommand(e, t = {}) {
    if (!this.isConnected || !this.cmdCharacteristic)
      throw new p("Not connected");
    const n = t.timeoutMs ?? this.options.commandTimeoutMs, s = this.generateRequestId();
    return new Promise((r, c) => {
      const l = setTimeout(() => {
        this.pendingCommands.delete(s), c(new U(`Command "${e}" timed out after ${n}ms`));
      }, n);
      this.pendingCommands.set(s, { resolve: r, reject: c, timeoutId: l }), this.enqueueCommand(async () => {
        try {
          const v = u.encodeCommand(e);
          await this.gattManager.writeValue(this.cmdCharacteristic, v);
        } catch (v) {
          const w = this.pendingCommands.get(s);
          w && (clearTimeout(w.timeoutId), this.pendingCommands.delete(s), w.reject(v));
        }
      });
    });
  }
  // ===== WM8741 register-level command =====
  /**
   * Write a full 8-bit value to a WM8741 register.
   *
   * Sends a SET_REG command to the firmware, which writes the value
   * directly to the target register(s) on the specified chip channel.
   *
   * @param reg     Register address (0x00–0x7F).
   * @param value   8-bit register value (0x00–0xFF).
   * @param channel Target chip: 'both', 'left', or 'right'.
   */
  async writeRegister(e, t, n = "both") {
    u.validateRegister(e, t);
    const s = e.toString(16).padStart(2, "0"), r = t.toString(16).padStart(2, "0");
    return this.sendCommand(
      u.buildChannelArgs("SET_REG", n, `${s} ${r}`)
    );
  }
  // ===== Event helpers =====
  addEventListener(e, t, n) {
    super.addEventListener(e, t, n);
  }
  removeEventListener(e, t, n) {
    super.removeEventListener(e, t, n);
  }
  // ===== Private helpers =====
  ensureSupported() {
    if (!g.isSupported())
      throw new f();
  }
  normalizeUuid(e) {
    return e.toString().toLowerCase();
  }
  generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  enqueueCommand(e) {
    this.commandQueue.push(e), this.isProcessingQueue || this.processCommandQueue();
  }
  async processCommandQueue() {
    for (this.isProcessingQueue = !0; this.commandQueue.length > 0; ) {
      const e = this.commandQueue.shift();
      if (e)
        try {
          await e();
        } catch {
        }
    }
    this.isProcessingQueue = !1;
  }
  onCharacteristicValueChanged(e) {
    const t = e.target, n = u.decodeResponse(t.value);
    this.dispatchEvent(new _(n));
    const s = this.pendingCommands.entries().next().value;
    if (s) {
      const [r, c] = s;
      clearTimeout(c.timeoutId), this.pendingCommands.delete(r), c.resolve(n);
    }
  }
  onGattDisconnected() {
    const e = this.isConnected;
    this.cleanup(!1).catch(() => {
    }), this.dispatchEvent(new $(e)), e && this.reconnectAttempts < this.options.maxReconnectAttempts ? this.scheduleReconnect() : this.stateMachine.transition("disconnected", "GATT server disconnected");
  }
  scheduleReconnect() {
    if (this.reconnectTimer)
      return;
    this.reconnectAttempts += 1;
    const e = Math.min(
      this.options.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts - 1),
      this.options.reconnectMaxDelayMs
    );
    this.stateMachine.transition("reconnecting", `attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts}`), this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null, this.stateMachine.transition("connecting", "automatic reconnect"), this.connect().then(() => {
        this.reconnectAttempts = 0;
      }).catch(() => {
        this.reconnectAttempts < this.options.maxReconnectAttempts ? this.scheduleReconnect() : this.stateMachine.transition("disconnected", "max reconnect attempts reached");
      });
    }, e);
  }
  cancelReconnect() {
    this.reconnectTimer && (clearTimeout(this.reconnectTimer), this.reconnectTimer = null), this.reconnectAttempts = 0;
  }
  async cleanup(e) {
    this.cancelReconnect();
    for (const [t, n] of this.pendingCommands)
      clearTimeout(n.timeoutId), n.reject(
        e ? new o("Disconnected by user") : new o("Connection lost")
      ), this.pendingCommands.delete(t);
    if (this.commandQueue = [], this.respCharacteristic && (await this.gattManager.stopNotifications(
      this.respCharacteristic,
      this.responseHandler
    ), this.respCharacteristic = null), this.device && this.device.removeEventListener("gattserverdisconnected", this.disconnectHandler), this.server && this.server.connected)
      try {
        this.server.disconnect();
      } catch {
      }
    this.cmdCharacteristic = null, this.server = null, e && (this.device = null);
  }
}
export {
  h as BLEError,
  u as CommandProtocol,
  o as ConnectionError,
  b as ConnectionStateMachine,
  U as ConnectionTimeoutError,
  T as DEFAULT_CMD_CHARACTERISTIC_UUID,
  y as DEFAULT_COMMAND_TIMEOUT_MS,
  M as DEFAULT_DEVICE_NAME,
  A as DEFAULT_MAX_RECONNECT_ATTEMPTS,
  S as DEFAULT_RECONNECT_BASE_DELAY_MS,
  R as DEFAULT_RECONNECT_MAX_DELAY_MS,
  E as DEFAULT_RESP_CHARACTERISTIC_UUID,
  C as DEFAULT_SERVICE_UUID,
  g as DeviceManager,
  $ as DisconnectEvent,
  d as GATTError,
  I as GATTManager,
  f as NotSupportedError,
  m as ProtocolError,
  _ as ResponseEvent,
  D as SecurityError,
  L as StateChangeEvent,
  p as StateError,
  N as WM8741BLEClient
};
//# sourceMappingURL=wm8741-ble.esm.js.map
