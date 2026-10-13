import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packTarGz, unpackTarGz } from './tar.js';
import { filterClaudeJson, mergeClaudeJson } from './claudeJson.js';
import { macKeychain } from './keychain.js';

export const MANIFEST_NAME = 'manifest.json';
export const CREDS_ENTRY_NAME = 'keychain/credentials';
const FULL_EXTRA_FILES = ['.claude/settings.json', '.claude/CLAUDE.md'];

function readIfExists(p) {
  try {
    return fs.readFileSync(p);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * @param {{ out?: string, full?: boolean, home?: string, keychain?: typeof macKeychain, log?: Function, warn?: Function }} opts
 */
export function runExport({
  out = 'claude-clone.tar.gz',
  full = false,
  home = os.homedir(),
  keychain = macKeychain,
  log = console.log,
  warn = console.error,
} = {}) {
  let creds;
  try {
    creds = keychain.read();
  } catch (err) {
    throw new Error(
      `failed to read keychain entry: ${err.stderr?.toString().trim() || err.message}\n` +
        '(macOS will prompt for your login password)',
    );
  }

  const entries = [{ name: CREDS_ENTRY_NAME, data: creds }];
  const manifest = { version: 1, files: [], hasCredentials: true };

  // ~/.claude.json: login fields only by default, whole file with --full.
  const claudeJson = readIfExists(path.join(home, '.claude.json'));
  if (claudeJson) {
    entries.push({ name: '.claude.json', data: full ? claudeJson : filterClaudeJson(claudeJson) });
    manifest.files.push('.claude.json');
  } else {
    warn('skip (not found): ~/.claude.json');
  }

  if (full) {
    for (const rel of FULL_EXTRA_FILES) {
      const data = readIfExists(path.join(home, rel));
      if (!data) {
        warn(`skip (not found): ~/${rel}`);
        continue;
      }
      entries.push({ name: rel, data });
      manifest.files.push(rel);
    }
  }

  entries.push({ name: MANIFEST_NAME, data: JSON.stringify(manifest, null, 2) });
  fs.writeFileSync(out, packTarGz(entries), { mode: 0o600 });
  fs.chmodSync(out, 0o600); // writeFileSync's mode only applies on create

  log(`✓ exported to ${out}`);
  log('  - keychain credentials');
  for (const f of manifest.files) log(`  - ~/${f}`);
  log('\n⚠  The bundle contains your OAuth token. Keep it private and delete after import.');
  return manifest;
}

// Resolve a bundle entry to a path inside `home`, or null if it tries to escape.
function safeDest(home, name) {
  const clean = path.normalize(name);
  if (path.isAbsolute(clean) || clean === '..' || clean.startsWith(`..${path.sep}`)) return null;
  const dst = path.join(home, clean);
  const rel = path.relative(home, dst);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return { clean, dst };
}

/**
 * @param {{ input: string, force?: boolean, home?: string, keychain?: typeof macKeychain, log?: Function, warn?: Function }} opts
 */
export function runImport({
  input,
  force = false,
  home = os.homedir(),
  keychain = macKeychain,
  log = console.log,
  warn = console.error,
}) {
  const entries = unpackTarGz(fs.readFileSync(input));
  let creds = '';
  const restored = [];

  for (const { name, data } of entries) {
    if (name === MANIFEST_NAME) continue;
    if (name === CREDS_ENTRY_NAME) {
      creds = data.toString('utf8');
      continue;
    }

    const target = safeDest(home, name);
    if (!target) {
      warn(`skip suspicious path: ${name}`);
      continue;
    }
    const { clean, dst } = target;
    fs.mkdirSync(path.dirname(dst), { recursive: true, mode: 0o700 });

    // .claude.json is merged so the destination's local UX state survives.
    if (clean === '.claude.json') {
      const existing = readIfExists(dst);
      const merged = mergeClaudeJson(existing, data);
      if (existing?.length && !force) fs.writeFileSync(`${dst}.bak`, existing, { mode: 0o600 });
      fs.writeFileSync(dst, merged, { mode: 0o600 });
      restored.push(`${clean} (merged)`);
      continue;
    }

    if (!force && fs.existsSync(dst)) fs.renameSync(dst, `${dst}.bak`);
    fs.writeFileSync(dst, data, { mode: 0o600 });
    restored.push(clean);
  }

  if (!creds) {
    warn('warning: no credentials entry found in bundle');
  } else {
    try {
      keychain.write(creds);
    } catch (err) {
      throw new Error(`failed to write keychain entry: ${err.message}`);
    }
  }

  log('✓ imported');
  if (creds) log('  - keychain credentials');
  for (const r of restored) log(`  - ~/${r}`);
  if (!force) log('\nExisting files were renamed to *.bak. Pass --force to skip backups.');
  return { restored, hasCredentials: Boolean(creds) };
}
