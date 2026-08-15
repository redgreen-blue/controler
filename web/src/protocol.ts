import { ProtocolError } from './errors.js';

/**
 * Channel target for dual-WM8741 configurations.
 *
 * - `both`: apply to both left and right WM8741 chips (default).
 * - `left`: apply only to the left channel chip (CSB = GND, 0x1A).
 * - `right`: apply only to the right channel chip (CSB = VDD, 0x1B).
 */
export type WM8741Channel = 'both' | 'left' | 'right';

/**
 * Command/response protocol helpers.
 *
 * The WM8741 firmware expects newline-terminated text commands such as
 * `VOLUME 50\n` and returns text responses via notifications.
 */
export class CommandProtocol {
  private static textEncoder = new TextEncoder();
  private static textDecoder = new TextDecoder('utf-8');

  /**
   * Encode a text command into a Uint8Array, appending a newline if absent.
   */
  static encodeCommand(cmd: string): Uint8Array {
    const normalized = cmd.endsWith('\n') ? cmd : `${cmd}\n`;
    return CommandProtocol.textEncoder.encode(normalized);
  }

  /**
   * Decode a DataView/ArrayBuffer into a UTF-8 string.
   */
  static decodeResponse(value?: DataView | ArrayBuffer | null): string {
    if (!value) {
      return '';
    }

    if (value instanceof DataView) {
      return CommandProtocol.textDecoder.decode(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    }

    return CommandProtocol.textDecoder.decode(value);
  }

  /**
   * Convert a Uint8Array to a lowercase hex string.
   */
  static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convert a hex string to a Uint8Array.
   *
   * @throws {ProtocolError} if the string is not valid hex.
   */
  static hexToBytes(hex: string): Uint8Array {
    const normalized = hex.replace(/\s+/g, '');
    if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(normalized)) {
      throw new ProtocolError(`Invalid hex string: ${hex}`);
    }

    const bytes = new Uint8Array(normalized.length / 2);
    for (let i = 0; i < normalized.length; i += 2) {
      bytes[i / 2] = parseInt(normalized.substring(i, i + 2), 16);
    }
    return bytes;
  }

  /**
   * Parse a register-write response such as `OK Reg BOTH 0x04=0x01`.
   *
   * The optional channel prefix (LEFT/RIGHT/BOTH) is accepted so responses
   * from dual-WM8741 configurations are parsed correctly.
   *
   * @returns The parsed register and value, or null if not matched.
   */
  static parseRegisterResponse(response: string): { reg: number; value: number } | null {
    const match = /OK Reg (?:LEFT |RIGHT |BOTH )?0x([0-9a-fA-F]+)=0x([0-9a-fA-F]+)/.exec(response);
    if (!match) {
      return null;
    }
    return {
      reg: parseInt(match[1], 16),
      value: parseInt(match[2], 16)
    };
  }

  /**
   * Validate that a volume step is within the WM8741 range.
   *
   * @throws {ProtocolError} if out of range.
   */
  static validateVolume(steps: number): void {
    if (!Number.isInteger(steps) || steps < 0 || steps > 127) {
      throw new ProtocolError('Volume must be an integer between 0 and 127');
    }
  }

  /**
   * Validate that a filter response index is within range.
   *
   * @throws {ProtocolError} if out of range.
   */
  static validateFilter(response: number): void {
    if (!Number.isInteger(response) || response < 1 || response > 5) {
      throw new ProtocolError('Filter response must be an integer between 1 and 5');
    }
  }

  /**
   * Validate an 8-bit register address and value.
   *
   * @throws {ProtocolError} if out of range.
   */
  static validateRegister(reg: number, value: number): void {
    if (!Number.isInteger(reg) || reg < 0 || reg > 0x7F) {
      throw new ProtocolError('Register address must be between 0 and 0x7F');
    }
    if (!Number.isInteger(value) || value < 0 || value > 0xFF) {
      throw new ProtocolError('Register value must be between 0 and 0xFF');
    }
  }

  /**
   * Validate an input audio format and word length for the WM8741.
   *
   * `format` values: 0 = Right Justified, 1 = Left Justified, 2 = I2S, 3 = DSP.
   * `wordLength` values: 0 = 16-bit, 1 = 20-bit, 2 = 24-bit, 3 = 32-bit.
   *
   * @throws {ProtocolError} if out of range.
   */
  static validateFormat(format: number, wordLength: number): void {
    if (!Number.isInteger(format) || format < 0 || format > 3) {
      throw new ProtocolError('Input format must be 0 (RJ), 1 (LJ), 2 (I2S), or 3 (DSP)');
    }
    if (!Number.isInteger(wordLength) || wordLength < 0 || wordLength > 3) {
      throw new ProtocolError('Word length must be 0 (16), 1 (20), 2 (24), or 3 (32 bit)');
    }
  }

  /**
   * Validate an MCLK source frequency for the WM8741.
   *
   * @throws {ProtocolError} if not 22 or 24 MHz.
   */
  static validateMclkFrequency(freq: number): void {
    if (freq !== 22 && freq !== 24) {
      throw new ProtocolError('MCLK frequency must be 22 or 24 MHz');
    }
  }

  /**
   * Validate a channel target for dual-WM8741 configurations.
   *
   * @throws {ProtocolError} if invalid.
   */
  static validateChannel(channel: string): asserts channel is WM8741Channel {
    if (!['both', 'left', 'right'].includes(channel)) {
      throw new ProtocolError('Channel must be both, left, or right');
    }
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
  static buildChannelArgs(command: string, channel: WM8741Channel, value: string): string {
    CommandProtocol.validateChannel(channel);
    const channelPart = channel === 'both' ? '' : ` ${channel.toUpperCase()}`;
    const valuePart = value ? ` ${value}` : '';
    return `${command}${channelPart}${valuePart}`;
  }
}
