// macOS keychain access through the `security` CLI.
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';

export const KEYCHAIN_SERVICE = 'Claude Code-credentials';

export function readKeychain() {
  const out = execFileSync(
    'security',
    ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return out.replace(/\n+$/, '');
}

export function writeKeychain(value) {
  const user = process.env.USER || os.userInfo().username;
  if (!user) throw new Error('USER env not set');

  // Best-effort delete of any existing entry; "not found" is fine.
  spawnSync('security', ['delete-generic-password', '-s', KEYCHAIN_SERVICE], { stdio: 'ignore' });

  const res = spawnSync(
    'security',
    ['add-generic-password', '-a', user, '-s', KEYCHAIN_SERVICE, '-w', value, '-U'],
    { encoding: 'utf8' },
  );
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`security exited ${res.status}: ${`${res.stdout}${res.stderr}`.trim()}`);
  }
}

export const macKeychain = { read: readKeychain, write: writeKeychain };
