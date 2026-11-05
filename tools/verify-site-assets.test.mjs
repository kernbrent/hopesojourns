import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {verifySiteAssets} from './verify-site-assets.mjs';

test('release rejects missing scripts even when an index fallback exists', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hs-assets-'));
  try {
    await writeFile(path.join(root, 'index.html'), '<script src="/phone-ui.js?v=1"></script>');
    await assert.rejects(verifySiteAssets(root), /Missing asset \/phone-ui.js/);
    await writeFile(path.join(root, 'phone-ui.js'), '<!doctype html><title>Fallback</title>');
    await assert.rejects(verifySiteAssets(root), /Invalid phone formatter/);
    await writeFile(path.join(root, 'phone-ui.js'), 'window.HSPhones={};');
    await mkdir(path.join(root, 'nested'));
    await writeFile(path.join(root, 'nested/index.html'), '<link rel="stylesheet" href="../styles.css?v=1"><script src="https://example.test/external.js"></script>');
    await assert.rejects(verifySiteAssets(root), /Missing asset ..\/styles.css/);
    await writeFile(path.join(root, 'styles.css'), ':root{}');
    assert.deepEqual(await verifySiteAssets(root), {pages: 2, references: 2});
  } finally { await rm(root, {recursive: true, force: true}); }
});
