import { it, expect } from 'vitest';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const scope = { window: {} as any };
vm.runInNewContext(readFileSync(new URL('../../../admin/contact-column-filters.js', import.meta.url), 'utf8'), scope);
const matches = scope.window.HSContactColumnFilters.matches;
it('keeps CSV columns and escaped multiline notes while exporting only matching contacts', () => {
  const header = '\uFEFF"contact_id","notes"';
  const retained = '"2","A comma, a ""quote"" and\na new line"';
  const csv = header + '\r\n"1","Other"\r\n' + retained;
  expect(scope.window.HSContactColumnFilters.filterCsv(csv, new Set(['2']))).toBe(header + '\r\n' + retained);
  expect(scope.window.HSContactColumnFilters.filterCsv(csv, new Set())).toBe(header);
});
it('matches any selected type but requires both filtered columns', () => {
  const filter = { contactTypes: new Set(['donor', 'volunteer']), organization: new Set(['CSM']) };
  expect(matches({ contactTypes: ['other', 'donor'], organization: 'CSM' }, filter)).toBe(true);
  expect(matches({ contactTypes: ['donor'], organization: 'Another ministry' }, filter)).toBe(false);
  expect(matches({ contactTypes: ['other'], organization: 'CSM' }, filter)).toBe(false);
});
it('distinguishes clear, no selections, blanks, and literal organization values', () => {
  const empty = { contactTypes: [], organization: null };
  expect(matches(empty, { contactTypes: null, organization: null })).toBe(true);
  expect(matches(empty, { contactTypes: new Set(), organization: null })).toBe(false);
  expect(matches(empty, { contactTypes: new Set(['']), organization: new Set(['']) })).toBe(true);
  expect(matches({ organization: ' A & B <Ministry> ' }, { organization: new Set(['A & B <Ministry>']) })).toBe(true);
  expect(matches({ organization: 'CSM West' }, { organization: new Set(['CSM']) })).toBe(false);
});
