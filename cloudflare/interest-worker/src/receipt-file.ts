export const RECEIPT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const RECEIPT_MAX_FILES_PER_ENTRY = 20;

export type ReceiptMedia = {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/avif" | "image/heic" | "image/heif" | "application/pdf";
  extension: "jpg" | "png" | "webp" | "avif" | "heic" | "heif" | "pdf";
  previewable: boolean;
};

export class ReceiptFileError extends Error {
  constructor(readonly code: string, message: string, readonly status = 422) {
    super(message);
  }
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectReceiptMedia(bytes: Uint8Array): ReceiptMedia {
  if (bytes.byteLength < 5) throw new ReceiptFileError("INVALID_RECEIPT_FILE", "Choose a valid receipt image or PDF.");
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mediaType: "image/jpeg", extension: "jpg", previewable: true };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mediaType: "image/png", extension: "png", previewable: true };
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { mediaType: "image/webp", extension: "webp", previewable: true };
  }
  if (ascii(bytes, 0, 5) === "%PDF-") return { mediaType: "application/pdf", extension: "pdf", previewable: false };
  if (bytes.byteLength >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4).toLocaleLowerCase("en-US");
    if (["avif", "avis"].includes(brand)) return { mediaType: "image/avif", extension: "avif", previewable: true };
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return { mediaType: "image/heic", extension: "heic", previewable: false };
    if (["heif", "mif1", "msf1"].includes(brand)) return { mediaType: "image/heif", extension: "heif", previewable: false };
  }
  throw new ReceiptFileError("UNSUPPORTED_RECEIPT_FILE", "Use a JPEG, PNG, WebP, AVIF, HEIC, HEIF, or PDF receipt file.");
}

export function cleanReceiptFileName(value: string): string {
  const cleaned = value.normalize("NFKC").replace(/[\\/]+/g, "-").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 180);
  if (!cleaned) throw new ReceiptFileError("INVALID_RECEIPT_NAME", "Choose a receipt file with a valid name.");
  return cleaned;
}

export function receiptObjectKey(ledgerEntryId: string, receiptId: string, extension: ReceiptMedia["extension"]): string {
  const entrySegment = ledgerEntryId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
  const receiptSegment = receiptId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
  if (!entrySegment || !receiptSegment) throw new ReceiptFileError("INVALID_RECEIPT_KEY", "The receipt storage key could not be prepared.", 500);
  return `ledger/${entrySegment}/${receiptSegment}.${extension}`;
}
