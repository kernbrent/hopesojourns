import { archiveEntries, OfficeArchiveError, unzipOfficeArchive, zipOfficeArchive } from "./office-archive";

export const DOCUMENT_TEMPLATE_MAX_BYTES = 2 * 1024 * 1024;
export const DOCUMENT_BATCH_MAX_CONTACTS = 25;

export class DocumentMergeError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type MergeContact = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  organization: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  lastContactedAt: string | null;
  lastContactedNote: string | null;
};

export type MergeGift = {
  date: string;
  amount: number;
  designation: string;
  paymentMethod: string;
};

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#([0-9]+);/g, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function encodeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function wordText(fragment: string): string {
  return [...fragment.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map(match => decodeXml(match[1])).join("");
}

function replaceTokenInFragment(fragment: string, token: string, replacement: string): { xml: string; count: number } {
  let current = fragment;
  let count = 0;
  while (count < 100) {
    const matches = [...current.matchAll(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/gi)];
    const values = matches.map(match => decodeXml(match[2]));
    const plain = values.join("");
    const tokenStart = plain.indexOf(token);
    if (tokenStart < 0) break;
    const tokenEnd = tokenStart + token.length;
    let cursor = 0;
    let startNode = -1;
    let endNode = -1;
    let startOffset = 0;
    let endOffset = 0;
    for (let index = 0; index < values.length; index += 1) {
      const next = cursor + values[index]!.length;
      if (startNode < 0 && tokenStart >= cursor && tokenStart < next) {
        startNode = index;
        startOffset = tokenStart - cursor;
      }
      if (tokenEnd > cursor && tokenEnd <= next) {
        endNode = index;
        endOffset = tokenEnd - cursor;
        break;
      }
      cursor = next;
    }
    if (startNode < 0 || endNode < 0) break;
    if (startNode === endNode) {
      values[startNode] = `${values[startNode]!.slice(0, startOffset)}${replacement}${values[startNode]!.slice(endOffset)}`;
    } else {
      values[startNode] = `${values[startNode]!.slice(0, startOffset)}${replacement}`;
      for (let index = startNode + 1; index < endNode; index += 1) values[index] = "";
      values[endNode] = values[endNode]!.slice(endOffset);
    }
    let valueIndex = 0;
    current = current.replace(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/gi, (_, attributes: string) => {
      const value = values[valueIndex++] ?? "";
      const hasSpace = /(?:^|\s)xml:space=/.test(attributes);
      const spaceAttribute = !hasSpace && (/^\s|\s$|\n/.test(value)) ? ' xml:space="preserve"' : "";
      return `<w:t${attributes}${spaceAttribute}>${encodeXml(value)}</w:t>`;
    });
    count += 1;
  }
  return { xml: current, count };
}

function replaceTokens(xml: string, replacements: Record<string, string>): { xml: string; count: number } {
  let count = 0;
  const replaced = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/gi, paragraph => {
    let current = paragraph;
    for (const [token, value] of Object.entries(replacements)) {
      const result = replaceTokenInFragment(current, token, value);
      current = result.xml;
      count += result.count;
    }
    return current;
  });
  return { xml: replaced, count };
}

function aliasReplacements(values: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    result[`[[${key}]]`] = value;
    const title = key.toLocaleLowerCase("en-US").replace(/(?:^|_)([a-z])/g, (_, letter: string) => letter.toUpperCase());
    result[`{{${title}}}`] = value;
  }
  return result;
}

function formatDate(value: string): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function cityStateZip(contact: MergeContact): string {
  const cityRegion = [contact.city, contact.region].filter(Boolean).join(", ");
  return [cityRegion, contact.postalCode].filter(Boolean).join(" ");
}

function contactValues(contact: MergeContact, at: Date): Record<string, string> {
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return {
    FIRST_NAME: contact.firstName,
    PREFERRED_NAME: contact.preferredName ?? "",
    LAST_NAME: contact.lastName,
    FULL_NAME: fullName,
    DONOR_NAME: fullName,
    GREETING_NAME: contact.preferredName || contact.firstName,
    ORGANIZATION: contact.organization ?? "",
    EMAIL: contact.email ?? "",
    PHONE: contact.phone ?? "",
    ADDRESS_LINE_1: contact.addressLine1 ?? "",
    ADDRESS_LINE_2_OPTIONAL: contact.addressLine2 ?? "",
    CITY: contact.city ?? "",
    STATE: contact.region ?? "",
    POSTAL_CODE: contact.postalCode ?? "",
    COUNTRY: contact.country ?? "",
    CITY_STATE_ZIP: cityStateZip(contact),
    LETTER_DATE: formatDate(at.toISOString()),
    LAST_CONTACTED_DATE: contact.lastContactedAt ? formatDate(contact.lastContactedAt) : "",
    LAST_CONTACTED_NOTE: contact.lastContactedNote ?? "",
  };
}

function safeFilePart(value: string, fallback: string): string {
  const cleaned = value.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]+/gu, "").replace(/\s+/g, " ").trim().slice(0, 80);
  return cleaned || fallback;
}

function mergeDocumentXml(
  xml: string,
  replacements: Record<string, string>,
  gifts: MergeGift[] | null,
): { xml: string; count: number } {
  let current = xml;
  let count = 0;
  if (gifts) {
    const rowMatches = [...current.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/gi)];
    const giftRow = rowMatches.find(match => wordText(match[0]).includes("[[GIFT_DATE]]") || wordText(match[0]).includes("{{GiftDate}}"));
    if (!giftRow || giftRow.index === undefined) throw new DocumentMergeError("The giving-statement template is missing its contribution-detail row.");
    const rows = gifts.length ? gifts : [{ date: "No recorded gifts", amount: 0, designation: "—", paymentMethod: "—" }];
    const repeated = rows.map(gift => {
      const result = replaceTokens(giftRow[0], aliasReplacements({
        GIFT_DATE: gift.date === "No recorded gifts" ? gift.date : formatDate(gift.date),
        GIFT_AMOUNT: gift.date === "No recorded gifts" ? "—" : money(gift.amount),
        DESIGNATION: gift.designation,
        PAYMENT_METHOD: gift.paymentMethod,
      }));
      count += result.count;
      return result.xml;
    }).join("");
    current = `${current.slice(0, giftRow.index)}${repeated}${current.slice(giftRow.index + giftRow[0].length)}`;
  }
  const result = replaceTokens(current, replacements);
  return { xml: result.xml, count: count + result.count };
}

export function mergeContactDocument(
  templateBytes: Uint8Array,
  contact: MergeContact,
  options: { taxYear?: number; gifts?: MergeGift[] | null; at?: Date } = {},
): { bytes: Uint8Array; replacementCount: number } {
  if (!templateBytes.byteLength || templateBytes.byteLength > DOCUMENT_TEMPLATE_MAX_BYTES) throw new DocumentMergeError("Choose a Word template smaller than 2 MB.");
  let entries: Map<string, Uint8Array>;
  try {
    entries = unzipOfficeArchive(templateBytes, { maxEntries: 350, maxEntryBytes: 24 * 1024 * 1024, maxTotalBytes: 48 * 1024 * 1024 });
  } catch (error) {
    throw new DocumentMergeError(error instanceof OfficeArchiveError ? error.message : "The Word template could not be opened.");
  }
  if (!entries.has("word/document.xml") || !entries.has("[Content_Types].xml")) throw new DocumentMergeError("Choose a valid Word .docx template.");
  const at = options.at ?? new Date();
  const gifts = options.gifts ?? null;
  const total = gifts?.reduce((sum, gift) => sum + gift.amount, 0) ?? 0;
  const replacements = aliasReplacements({
    ...contactValues(contact, at),
    TAX_YEAR: String(options.taxYear ?? at.getUTCFullYear()),
    RECEIPT_NUMBER: `HS-${options.taxYear ?? at.getUTCFullYear()}-${contact.id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()}`,
    TOTAL_GIFT_AMOUNT: money(total),
  });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");
  let replacementCount = 0;
  for (const [name, bytes] of entries) {
    if (!/^word\/(?:document|header\d+|footer\d+)\.xml$/i.test(name)) continue;
    const source = decoder.decode(bytes);
    const result = name === "word/document.xml" ? mergeDocumentXml(source, replacements, gifts) : replaceTokens(source, replacements);
    entries.set(name, encoder.encode(result.xml));
    replacementCount += result.count;
  }
  if (!replacementCount) throw new DocumentMergeError("The template does not contain a supported Hope Sojourns merge field.");
  return { bytes: zipOfficeArchive(archiveEntries(entries), at), replacementCount };
}

export function buildDocumentBatchZip(
  templateBytes: Uint8Array,
  contacts: Array<{ contact: MergeContact; gifts?: MergeGift[] }>,
  options: { kind: "giving_statement" | "mail_merge"; taxYear?: number; templateName: string; at?: Date },
): Uint8Array {
  if (!contacts.length || contacts.length > DOCUMENT_BATCH_MAX_CONTACTS) throw new DocumentMergeError(`Choose between 1 and ${DOCUMENT_BATCH_MAX_CONTACTS} contacts.`);
  const at = options.at ?? new Date();
  const output = contacts.map(({ contact, gifts }) => {
    const merged = mergeContactDocument(templateBytes, contact, {
      taxYear: options.taxYear,
      gifts: options.kind === "giving_statement" ? gifts ?? [] : null,
      at,
    });
    const name = safeFilePart(`${contact.lastName}-${contact.firstName}`, contact.id.slice(0, 12));
    const suffix = options.kind === "giving_statement" ? `${options.taxYear}-Giving-Statement` : safeFilePart(options.templateName.replace(/\.docx$/i, ""), "Merged-Letter");
    return { name: `${name}-${suffix}.docx`, bytes: merged.bytes };
  });
  const noGiftContacts = options.kind === "giving_statement"
    ? contacts.filter(item => !(item.gifts?.length)).map(item => `${item.contact.firstName} ${item.contact.lastName}`)
    : [];
  const readme = [
    `Hope Sojourns document batch created ${at.toISOString()}`,
    `Documents: ${output.length}`,
    options.kind === "giving_statement" ? `Tax year: ${options.taxYear}` : `Template: ${options.templateName}`,
    ...(noGiftContacts.length ? ["", "Statements with no recorded gifts:", ...noGiftContacts.map(name => `- ${name}`)] : []),
  ].join("\r\n");
  output.push({ name: "README.txt", bytes: new TextEncoder().encode(readme) });
  return zipOfficeArchive(output, at);
}
