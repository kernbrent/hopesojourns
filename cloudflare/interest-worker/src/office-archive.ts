import { deflateRawSync, inflateRawSync } from "node:zlib";

export type ArchiveEntry = { name: string; bytes: Uint8Array };

export class OfficeArchiveError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function readU16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) throw new OfficeArchiveError("The Office file is incomplete or damaged.");
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) throw new OfficeArchiveError("The Office file is incomplete or damaged.");
  return view.getUint32(offset, true);
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function unzipOfficeArchive(
  bytes: Uint8Array,
  options: { maxEntries?: number; maxEntryBytes?: number; maxTotalBytes?: number } = {},
): Map<string, Uint8Array> {
  const maxEntries = options.maxEntries ?? 300;
  const maxEntryBytes = options.maxEntryBytes ?? 24 * 1024 * 1024;
  const maxTotalBytes = options.maxTotalBytes ?? 48 * 1024 * 1024;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimumEocd = Math.max(0, bytes.byteLength - 65_557);
  let eocdOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimumEocd; offset -= 1) {
    if (readU32(view, offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new OfficeArchiveError("Choose a valid Office .xlsx or .docx file.");

  const entryCount = readU16(view, eocdOffset + 10);
  const centralSize = readU32(view, eocdOffset + 12);
  const centralOffset = readU32(view, eocdOffset + 16);
  if (!entryCount || entryCount > maxEntries || centralOffset + centralSize > bytes.byteLength) {
    throw new OfficeArchiveError("This Office file is too complex to process safely.");
  }

  const decoder = new TextDecoder("utf-8");
  const entries: Array<{ name: string; method: number; compressedSize: number; uncompressedSize: number; localOffset: number }> = [];
  let totalUncompressed = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(view, offset) !== 0x02014b50) throw new OfficeArchiveError("The Office file directory is damaged.");
    const flags = readU16(view, offset + 8);
    const method = readU16(view, offset + 10);
    const compressedSize = readU32(view, offset + 20);
    const uncompressedSize = readU32(view, offset + 24);
    const nameLength = readU16(view, offset + 28);
    const extraLength = readU16(view, offset + 30);
    const commentLength = readU16(view, offset + 32);
    const localOffset = readU32(view, offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if ((flags & 1) !== 0 || (method !== 0 && method !== 8) || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || nextOffset > bytes.byteLength) {
      throw new OfficeArchiveError("This Office file uses an unsupported or protected format.");
    }
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).replace(/\\/g, "/");
    if (!name || name.startsWith("/") || name.includes("../") || /^[A-Za-z]:/.test(name)) {
      throw new OfficeArchiveError("This Office file contains an unsafe internal path.");
    }
    totalUncompressed += uncompressedSize;
    if (uncompressedSize > maxEntryBytes || totalUncompressed > maxTotalBytes) {
      throw new OfficeArchiveError("This Office file expands beyond the safe processing limit.");
    }
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    offset = nextOffset;
  }

  const result = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (entry.name.endsWith("/")) continue;
    if (readU32(view, entry.localOffset) !== 0x04034b50) throw new OfficeArchiveError("The Office file contains a damaged entry.");
    const nameLength = readU16(view, entry.localOffset + 26);
    const extraLength = readU16(view, entry.localOffset + 28);
    const dataStart = entry.localOffset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataStart < 0 || dataEnd > bytes.byteLength) throw new OfficeArchiveError("The Office file contains an incomplete entry.");
    const compressed = bytes.subarray(dataStart, dataEnd);
    let uncompressed: Uint8Array;
    try {
      uncompressed = entry.method === 0 ? compressed.slice() : new Uint8Array(inflateRawSync(compressed, { maxOutputLength: maxEntryBytes }));
    } catch {
      throw new OfficeArchiveError("The Office file could not be opened.");
    }
    if (uncompressed.byteLength !== entry.uncompressedSize) throw new OfficeArchiveError("The Office file contains an incomplete entry.");
    result.set(entry.name, uncompressed);
  }
  return result;
}

export function zipOfficeArchive(entries: Iterable<ArchiveEntry>, at = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;
  const year = Math.min(2107, Math.max(1980, at.getUTCFullYear()));
  const dosTime = (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate();
  let count = 0;

  for (const entry of entries) {
    const normalizedName = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!normalizedName || normalizedName.includes("../")) throw new OfficeArchiveError("The output archive contains an unsafe file name.");
    const name = encoder.encode(normalizedName);
    const raw = entry.bytes;
    const deflated = raw.byteLength > 48 ? new Uint8Array(deflateRawSync(raw)) : raw;
    const method = deflated === raw ? 0 : 8;
    const checksum = crc32(raw);
    const local = new Uint8Array(30 + name.byteLength + deflated.byteLength);
    const localView = new DataView(local.buffer);
    writeU32(localView, 0, 0x04034b50);
    writeU16(localView, 4, 20);
    writeU16(localView, 6, 0x0800);
    writeU16(localView, 8, method);
    writeU16(localView, 10, dosTime);
    writeU16(localView, 12, dosDate);
    writeU32(localView, 14, checksum);
    writeU32(localView, 18, deflated.byteLength);
    writeU32(localView, 22, raw.byteLength);
    writeU16(localView, 26, name.byteLength);
    local.set(name, 30);
    local.set(deflated, 30 + name.byteLength);
    locals.push(local);

    const central = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(central.buffer);
    writeU32(centralView, 0, 0x02014b50);
    writeU16(centralView, 4, 20);
    writeU16(centralView, 6, 20);
    writeU16(centralView, 8, 0x0800);
    writeU16(centralView, 10, method);
    writeU16(centralView, 12, dosTime);
    writeU16(centralView, 14, dosDate);
    writeU32(centralView, 16, checksum);
    writeU32(centralView, 20, deflated.byteLength);
    writeU32(centralView, 24, raw.byteLength);
    writeU16(centralView, 28, name.byteLength);
    writeU32(centralView, 42, localOffset);
    central.set(name, 46);
    centrals.push(central);
    localOffset += local.byteLength;
    count += 1;
  }

  const centralSize = centrals.reduce((total, chunk) => total + chunk.byteLength, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeU32(endView, 0, 0x06054b50);
  writeU16(endView, 8, count);
  writeU16(endView, 10, count);
  writeU32(endView, 12, centralSize);
  writeU32(endView, 16, localOffset);
  return concatBytes([...locals, ...centrals, end]);
}

export function archiveEntries(entries: Map<string, Uint8Array>): ArchiveEntry[] {
  return [...entries.entries()].map(([name, bytes]) => ({ name, bytes }));
}
