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
    it('parses a register response without channel', () => {
      const result = CommandProtocol.parseRegisterResponse('OK Reg 0x04=0x01');
      expect(result).toEqual({ reg: 0x04, value: 0x01 });
    });

    it('parses a register response with channel prefix', () => {
      const result = CommandProtocol.parseRegisterResponse('OK Reg BOTH 0x04=0x01');
      expect(result).toEqual({ reg: 0x04, value: 0x01 });
    });

    it('parses a per-channel register response', () => {
      const result = CommandProtocol.parseRegisterResponse('OK Reg LEFT 0x20=0xFF');
      expect(result).toEqual({ reg: 0x20, value: 0xff });
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

    it('validates input format and word length', () => {
      expect(() => CommandProtocol.validateFormat(2, 2)).not.toThrow();
      expect(() => CommandProtocol.validateFormat(0, 3)).not.toThrow();
      expect(() => CommandProtocol.validateFormat(4, 2)).toThrow(ProtocolError);
      expect(() => CommandProtocol.validateFormat(-1, 2)).toThrow(ProtocolError);
      expect(() => CommandProtocol.validateFormat(2, 4)).toThrow(ProtocolError);
      expect(() => CommandProtocol.validateFormat(2, 1.5)).toThrow(ProtocolError);
    });

    it('validates MCLK frequency', () => {
      expect(() => CommandProtocol.validateMclkFrequency(22)).not.toThrow();
      expect(() => CommandProtocol.validateMclkFrequency(24)).not.toThrow();
      expect(() => CommandProtocol.validateMclkFrequency(44.1)).toThrow(ProtocolError);
      expect(() => CommandProtocol.validateMclkFrequency(0)).toThrow(ProtocolError);
    });

    it('validates channel target', () => {
      expect(() => CommandProtocol.validateChannel('both')).not.toThrow();
      expect(() => CommandProtocol.validateChannel('left')).not.toThrow();
      expect(() => CommandProtocol.validateChannel('right')).not.toThrow();
      expect(() => CommandProtocol.validateChannel('center')).toThrow(ProtocolError);
    });
  });

  describe('buildChannelArgs', () => {
    it('omits channel for "both"', () => {
      expect(CommandProtocol.buildChannelArgs('VOLUME', 'both', '50')).toBe('VOLUME 50');
    });

    it('includes channel for "left" and "right"', () => {
      expect(CommandProtocol.buildChannelArgs('VOLUME', 'left', '50')).toBe('VOLUME LEFT 50');
      expect(CommandProtocol.buildChannelArgs('VOLUME', 'right', '50')).toBe('VOLUME RIGHT 50');
    });

    it('omits value when empty', () => {
      expect(CommandProtocol.buildChannelArgs('RESET', 'both', '')).toBe('RESET');
      expect(CommandProtocol.buildChannelArgs('RESET', 'left', '')).toBe('RESET LEFT');
    });

    it('supports multi-word values', () => {
      expect(CommandProtocol.buildChannelArgs('SET_REG', 'left', '04 01')).toBe('SET_REG LEFT 04 01');
    });
  });
});
