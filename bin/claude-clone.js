#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { runExport, runImport } from '../src/commands.js';

const USAGE = `claude-clone — copy your Claude Code login state between machines.

Usage:
  claude-clone export [-o <file>] [--full]
  claude-clone import [--force] <file>

Commands:
  export   Bundle the keychain credentials and the login fields of
           ~/.claude.json into a tar.gz.
           -o, --out <file>  output file (default: claude-clone.tar.gz)
           --full            include the entire ~/.claude.json plus
                             ~/.claude/settings.json and ~/.claude/CLAUDE.md
  import   Restore a bundle on a new machine.
           --force           overwrite without creating .bak copies

The bundle contains your OAuth token in plain text inside the archive.
Transfer it over a secure channel (scp/AirDrop) and delete after import.`;

function fail(msg, showUsage = false) {
  console.error(msg);
  if (showUsage) console.error(`\n${USAGE}`);
  process.exit(1);
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd) fail('missing command', true);
  if (['-h', '--help', 'help'].includes(cmd)) {
    console.log(USAGE);
    return;
  }
  if (process.platform !== 'darwin') {
    fail('error: macOS only (uses the `security` CLI for keychain access)');
  }

  if (cmd === 'export') {
    const { values } = parseArgs({
      args: rest,
      options: {
        out: { type: 'string', short: 'o', default: 'claude-clone.tar.gz' },
        full: { type: 'boolean', default: false },
      },
    });
    runExport({ out: values.out, full: values.full });
  } else if (cmd === 'import') {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { force: { type: 'boolean', default: false } },
    });
    if (positionals.length < 1) fail('usage: claude-clone import [--force] <file>');
    runImport({ input: positionals[0], force: values.force });
  } else {
    fail(`unknown command: ${cmd}`, true);
  }
}

try {
  main(process.argv.slice(2));
} catch (err) {
  fail(`error: ${err.message}`);
}
