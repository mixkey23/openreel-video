import { describe, it, expect } from "vitest";
import { encodeWavPcm16 } from "./wav-encode";

describe("encodeWavPcm16", () => {
  it("writes a valid mono 16-bit PCM header and clamps samples", async () => {
    const blob = encodeWavPcm16(new Float32Array([0, 1, -1, 2, -2, 0.5]), 16000);
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    const view = new DataView(buffer);
    const tag = (o: number) => String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(12); // 6 samples * 2 bytes
    expect(view.byteLength).toBe(44 + 12);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
    expect(view.getInt16(50, true)).toBe(0x7fff); // clamped
    expect(view.getInt16(52, true)).toBe(-0x8000); // clamped
  });
});
