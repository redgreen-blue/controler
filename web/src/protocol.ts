import { ProtocolError } from './errors.js';

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
   * Parse a register-write response such as `OK Reg 0x04=0x01`.
   *
   * @returns The parsed register and value, or null if not matched.
   */
  static parseRegisterResponse(response: string): { reg: number; value: number } | null {
    const match = /OK Reg 0x([0-9a-fA-F]+)=0x([0-9a-fA-F]+)/.exec(response);
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
}
