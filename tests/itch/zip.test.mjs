// Run with node --test (no dependencies). The itch.io release's ZIP writer
// and reader (tools/itch/zip.mjs): what it writes reads back byte for byte,
// the same files always make the same archive, and a damaged archive is
// refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, readZip, writeZip, STORED, DEFLATED } from '../../tools/itch/zip.mjs';

const FILES = [
  { name: 'index.html', data: Buffer.from('<!doctype html>\n<script type="module" src="./assets/index.js"></script>\n'.repeat(20)) },
  { name: 'assets/index.js', data: Buffer.from('console.log("Mavooli");\n'.repeat(50)) },
  // High-entropy bytes, the same every run: deflating them only makes them larger.
  { name: 'assets/noise.bin', data: Buffer.concat(Array.from({ length: 16 }, (_, i) => createHash('sha256').update(`Mavooli ${i}`).digest())) },
  { name: 'assets/empty.txt', data: Buffer.alloc(0) },
];

test('CRC-32 is the standard one', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test('every file reads back byte for byte, in order, deflated only when that is smaller', () => {
  const entries = readZip(writeZip(FILES));
  assert.deepEqual(entries.map((e) => e.name), FILES.map((f) => f.name));
  for (const [i, e] of entries.entries()) assert.ok(e.data.equals(FILES[i].data), e.name);
  assert.equal(entries[0].method, DEFLATED, 'repetitive text is deflated');
  assert.equal(entries[2].method, STORED, 'data that does not shrink is stored');
});

test('the same files always make the same archive', () => {
  const a = writeZip(FILES);
  const b = writeZip(FILES.map((f) => ({ name: f.name, data: Buffer.from(f.data) })));
  assert.ok(a.equals(b));
});

test('a damaged archive is refused', () => {
  const zip = writeZip(FILES);
  const bad = Buffer.from(zip);
  const at = bad.indexOf(Buffer.from('Mavooli')) >= 0 ? bad.indexOf(Buffer.from('Mavooli')) : 40;
  bad[at] ^= 0xff;
  assert.throws(() => readZip(bad));
  assert.throws(() => readZip(Buffer.from('not a zip')), /no end of central directory/);
});

test('the system unzip, where there is one, extracts it to the same files', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mavooli-zip-'));
  try {
    writeFileSync(join(dir, 'a.zip'), writeZip(FILES));
    try {
      execFileSync('unzip', ['-q', 'a.zip', '-d', 'out'], { cwd: dir, stdio: 'ignore' });
    } catch {
      t.skip('no unzip here');
      return;
    }
    for (const f of FILES) assert.ok(readFileSync(join(dir, 'out', f.name)).equals(f.data), f.name);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
