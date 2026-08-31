import { describe, expect, it } from "vitest";
import { cleanReceiptFileName, detectReceiptMedia, ReceiptFileError, receiptObjectKey } from "../src/receipt-file";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function brandedFile(brand: string): Uint8Array {
  return new Uint8Array([0, 0, 0, 20, ...new TextEncoder().encode("ftyp"), ...new TextEncoder().encode(brand), 0, 0, 0, 0]);
}

describe("receipt file validation", () => {
  it.each([
    [bytes(0xff, 0xd8, 0xff, 0xe0, 0), "image/jpeg", "jpg", true],
    [bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image/png", "png", true],
    [new Uint8Array(new TextEncoder().encode("RIFF1234WEBP")), "image/webp", "webp", true],
    [new Uint8Array(new TextEncoder().encode("%PDF-1.7")), "application/pdf", "pdf", false],
    [brandedFile("avif"), "image/avif", "avif", true],
    [brandedFile("heic"), "image/heic", "heic", false],
    [brandedFile("heif"), "image/heif", "heif", false],
  ])("recognizes file signatures instead of trusting extensions", (file, mediaType, extension, previewable) => {
    expect(detectReceiptMedia(file)).toEqual({ mediaType, extension, previewable });
  });

  it("rejects disguised or unsupported bytes", () => {
    expect(() => detectReceiptMedia(new TextEncoder().encode("not-a-real-image.jpg"))).toThrow(ReceiptFileError);
  });

  it("cleans uploaded names and creates non-public object keys", () => {
    expect(cleanReceiptFileName(" ../camera/receipt\u0000.jpg ")).toBe("..-camera-receipt.jpg");
    expect(receiptObjectKey("ledger/id", "receipt:id", "jpg")).toBe("ledger/ledger_id/receipt_id.jpg");
  });
});
