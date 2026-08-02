import { describe, it, expect } from 'vitest';
import { CommandProtocol } from '../../src/protocol.js';
import { ProtocolError } from '../../src/errors.js';

describe('CommandProtocol', () => {
  describe('encodeCommand', () => {
    it('encodes text and appends newline', () => {
      const bytes = CommandProtocol.encodeCommand('VOLUME 50');
      const decoded = new TextDecoder().decode(bytes);
      expect(decoded).toBe('VOLUME 50\n');
    });

    it('does not double newline', () => {
      const bytes = CommandProtocol.encodeCommand('RESET\n');
      const decoded = new TextDecoder().decode(bytes);
      expect(decoded).toBe('RESET\n');
    });
  });

  describe('decodeResponse', () => {
    it('decodes a DataView', () => {
      const encoder = new TextEncoder();
      const bytes = encoder.encode('OK Volume 50');
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(CommandProtocol.decodeResponse(view)).toBe('OK Volume 50');
    });

    it('returns empty string for null/undefined', () => {
      expect(CommandProtocol.decodeResponse(null)).toBe('');
      expect(CommandProtocol.decodeResponse(undefined)).toBe('');
    });
  });

  describe('bytesToHex / hexToBytes', () => {
    it('round-trips bytes through hex', () => {
      const bytes = new Uint8Array([0x01, 0xab, 0xff]);
      const hex = CommandProtocol.bytesToHex(bytes);
      expect(hex).toBe('01abff');
      expect(CommandProtocol.hexToBytes(hex)).toEqual(bytes);
    });

    it('ignores whitespace in hex strings', () => {
      expect(CommandProtocol.hexToBytes('01 AB FF')).toEqual(
        new Uint8Array([0x01, 0xab, 0xff])
      );
    });

    it('throws on invalid hex', () => {
      expect(() => CommandProtocol.hexToBytes('xyz')).toThrow(ProtocolError);
      expect(() => CommandProtocol.hexToBytes('123')).toThrow(ProtocolError);
    });
  });

  describe('parseRegisterResponse', () => {
    it('parses a valid register response', () => {
      const result = CommandProtocol.parseRegisterResponse('OK Reg 0x04=0x01');
      expect(result).toEqual({ reg: 0x04, value: 0x01 });
    });

    it('returns null for non-matching responses', () => {
      expect(CommandProtocol.parseRegisterResponse('OK Volume 50')).toBeNull();
    });
  });

  describe('validators', () => {
    it('validates volume range', () => {
      expect(() => CommandProtocol.validateVolume(50)).not.toThrow();
      expect(() => CommandProtocol.validateVolume(-1)).toThrow(ProtocolError);
      expect(() => CommandProtocol.validateVolume(128)).toThrow(ProtocolError);
      expect(() => CommandProtocol.validateVolume(1.5)).toThrow(ProtocolError);
    });

    it('validates filter range', () => {
      expect(() => CommandProtocol.validateFilter(3)).not.toThrow();
      expect(() => CommandProtocol.validateFilter(0)).toThrow(ProtocolError);
      expect(() => CommandProtocol.validateFilter(6)).toThrow(ProtocolError);
    });

    it('validates register range', () => {
      expect(() => CommandProtocol.validateRegister(0x04, 0xff)).not.toThrow();
      expect(() => CommandProtocol.validateRegister(0x80, 0x00)).toThrow(ProtocolError);
      expect(() => CommandProtocol.validateRegister(0x00, 0x100)).toThrow(ProtocolError);
    });
  });
});
