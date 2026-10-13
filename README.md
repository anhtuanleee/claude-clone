# claude-clone (Node.js)

A Node.js port of [subdiox/claude-clone](https://github.com/subdiox/claude-clone):
move your Claude Code login state from one Mac to another in one command.
Zero dependencies, requires Node >= 18, macOS only.

The `.tar.gz` bundle uses the same format as the Go version, so you can export
with one implementation and import with the other.

## What's in the bundle

| Tar entry                | Source                                                          |
| ------------------------ | --------------------------------------------------------------- |
| `keychain/credentials`   | Keychain item `Claude Code-credentials` (OAuth token)           |
| `.claude.json`           | Only `oauthAccount` and `userID` by default; whole file with `--full` |
| `.claude/settings.json`  | Only with `--full`                                              |
| `.claude/CLAUDE.md`      | Only with `--full`                                              |
| `manifest.json`          | `{ version, files, hasCredentials }`                            |

## Installation

```sh
git clone https://github.com/anhtuanleee/claude-clone.git
cd claude-clone
npm link            # installs a global `claude-clone` command
# or run it directly: node bin/claude-clone.js ...
```

## Usage

On the source machine:

```sh
claude-clone export                  # -> claude-clone.tar.gz
claude-clone export -o login.tar.gz
claude-clone export --full
```

macOS will ask for your login password to allow keychain access.

Transfer the file over a secure channel (`scp`, AirDrop), then on the
destination machine:

```sh
claude-clone import claude-clone.tar.gz
claude-clone import --force claude-clone.tar.gz   # skip .bak backups
```

On import:

- `~/.claude.json` is **merged**: keys from the bundle win, every other key on
  the destination is kept. The previous file is saved as `~/.claude.json.bak`.
- Any other existing file is renamed to `*.bak` before being overwritten.
- The existing keychain entry is deleted and recreated.
- Bundle paths that try to escape `$HOME` (`../`, absolute paths) are skipped.

## Security

The OAuth token is stored **in plain text** inside the archive (the file is
created with mode `0600`). Delete the bundle on both machines once the import
is done.

During import the token is passed to `security add-generic-password -w <token>`
via argv (same as the Go version), so while that command runs, other users on
the same machine may be able to see it with `ps`.

## Project layout

```
bin/claude-clone.js   CLI (argument parsing, usage)
src/commands.js       runExport / runImport
src/claudeJson.js     filter and merge ~/.claude.json
src/keychain.js       read/write the keychain via `security`
src/tar.js            minimal ustar + gzip reader/writer (also reads PAX / GNU long names)
test/                 node:test — run with `npm test`
```

## Testing

```sh
npm test
```

The tests use a temporary `$HOME` and a fake keychain, so they never touch your
real credentials.
