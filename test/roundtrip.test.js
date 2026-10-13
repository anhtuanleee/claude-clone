import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packTarGz, unpackTarGz } from '../src/tar.js';
import { runExport, runImport } from '../src/commands.js';

const quiet = { log: () => {}, warn: () => {} };

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claude-clone-test-'));
}

function fakeKeychain(value) {
  const kc = { value, read: () => kc.value, write: (v) => { kc.value = v; } };
  return kc;
}

test('tar pack/unpack roundtrip', () => {
  const big = Buffer.alloc(1300, 7);
  const entries = unpackTarGz(packTarGz([
    { name: 'a.txt', data: 'hello' },
    { name: 'dir/b.bin', data: big },
    { name: 'empty', data: '' },
  ]));
  assert.deepEqual(entries.map((e) => e.name), ['a.txt', 'dir/b.bin', 'empty']);
  assert.equal(entries[0].data.toString(), 'hello');
  assert.ok(entries[1].data.equals(big));
  assert.equal(entries[2].data.length, 0);
});

test('export (minimal) then import into another home', () => {
  const src = tmpHome();
  const dst = tmpHome();
  const bundle = path.join(src, 'bundle.tar.gz');
  fs.writeFileSync(path.join(src, '.claude.json'),
    JSON.stringify({ oauthAccount: { id: 'acc' }, userID: 'u1', theme: 'dark' }));
  fs.writeFileSync(path.join(dst, '.claude.json'),
    JSON.stringify({ theme: 'light', projects: { x: 1 } }));

  const manifest = runExport({ out: bundle, home: src, keychain: fakeKeychain('TOKEN'), ...quiet });
  assert.deepEqual(manifest.files, ['.claude.json']);
  assert.equal(fs.statSync(bundle).mode & 0o777, 0o600);

  const names = unpackTarGz(fs.readFileSync(bundle)).map((e) => e.name);
  assert.deepEqual(names, ['keychain/credentials', '.claude.json', 'manifest.json']);

  const kc = fakeKeychain('');
  runImport({ input: bundle, home: dst, keychain: kc, ...quiet });
  assert.equal(kc.value, 'TOKEN');

  const merged = JSON.parse(fs.readFileSync(path.join(dst, '.claude.json'), 'utf8'));
  assert.equal(merged.theme, 'light'); // not exported → destination keeps its own
  assert.deepEqual(merged.projects, { x: 1 });
  assert.equal(merged.userID, 'u1');
  assert.ok(fs.existsSync(path.join(dst, '.claude.json.bak')));
});

test('export --full includes settings and CLAUDE.md; import backs up existing', () => {
  const src = tmpHome();
  const dst = tmpHome();
  const bundle = path.join(src, 'bundle.tar.gz');
  fs.mkdirSync(path.join(src, '.claude'));
  fs.writeFileSync(path.join(src, '.claude.json'), '{"userID":"u1","theme":"dark"}');
  fs.writeFileSync(path.join(src, '.claude/settings.json'), '{"model":"opus"}');
  fs.writeFileSync(path.join(src, '.claude/CLAUDE.md'), '# hi');
  fs.mkdirSync(path.join(dst, '.claude'));
  fs.writeFileSync(path.join(dst, '.claude/settings.json'), '{"old":true}');

  const manifest = runExport({ out: bundle, full: true, home: src, keychain: fakeKeychain('T'), ...quiet });
  assert.deepEqual(manifest.files, ['.claude.json', '.claude/settings.json', '.claude/CLAUDE.md']);

  runImport({ input: bundle, home: dst, keychain: fakeKeychain(''), ...quiet });
  assert.equal(fs.readFileSync(path.join(dst, '.claude/settings.json'), 'utf8'), '{"model":"opus"}');
  assert.equal(fs.readFileSync(path.join(dst, '.claude/settings.json.bak'), 'utf8'), '{"old":true}');
  assert.equal(fs.readFileSync(path.join(dst, '.claude/CLAUDE.md'), 'utf8'), '# hi');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dst, '.claude.json'))).theme, 'dark');
});

test('import --force skips backups', () => {
  const dst = tmpHome();
  const bundle = path.join(dst, 'b.tar.gz');
  fs.writeFileSync(bundle, packTarGz([
    { name: 'keychain/credentials', data: 'T' },
    { name: '.claude.json', data: '{"userID":"u2"}' },
  ]));
  fs.writeFileSync(path.join(dst, '.claude.json'), '{"userID":"u1"}');
  runImport({ input: bundle, home: dst, force: true, keychain: fakeKeychain(''), ...quiet });
  assert.ok(!fs.existsSync(path.join(dst, '.claude.json.bak')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dst, '.claude.json'))).userID, 'u2');
});

test('import refuses paths escaping home', () => {
  const dst = tmpHome();
  const bundle = path.join(dst, 'evil.tar.gz');
  fs.writeFileSync(bundle, packTarGz([
    { name: '../escaped.txt', data: 'x' },
    { name: '/tmp/abs.txt', data: 'x' },
    { name: 'ok/../../escaped2.txt', data: 'x' },
  ]));
  const warnings = [];
  runImport({ input: bundle, home: dst, keychain: fakeKeychain(''), log: () => {}, warn: (m) => warnings.push(m) });
  assert.ok(!fs.existsSync(path.join(path.dirname(dst), 'escaped.txt')));
  assert.ok(!fs.existsSync(path.join(path.dirname(dst), 'escaped2.txt')));
  assert.equal(warnings.filter((w) => w.startsWith('skip suspicious')).length, 3);
});
