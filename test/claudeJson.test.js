import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterClaudeJson, mergeClaudeJson } from '../src/claudeJson.js';

test('filter keeps only login keys', () => {
  const input = '{"oauthAccount":{"id":"abc"},"userID":"u1","theme":"dark","numStartups":42}';
  const got = JSON.parse(filterClaudeJson(input));
  assert.deepEqual(Object.keys(got).sort(), ['oauthAccount', 'userID']);
});

test('filter drops missing keys', () => {
  const got = JSON.parse(filterClaudeJson('{"userID":"u1"}'));
  assert.deepEqual(got, { userID: 'u1' });
});

test('filter rejects invalid json', () => {
  assert.throws(() => filterClaudeJson('{nope'), /parse ~\/.claude.json/);
});

test('merge preserves destination keys, overlay wins', () => {
  const base = '{"theme":"dark","numStartups":42,"oauthAccount":{"id":"old"}}';
  const overlay = '{"oauthAccount":{"id":"new"},"userID":"u1"}';
  const got = JSON.parse(mergeClaudeJson(base, overlay));
  assert.equal(got.theme, 'dark');
  assert.equal(got.numStartups, 42);
  assert.equal(got.userID, 'u1');
  assert.equal(got.oauthAccount.id, 'new');
});

test('merge with empty base returns overlay verbatim', () => {
  const overlay = '{"userID":"u1"}';
  assert.equal(mergeClaudeJson(null, overlay), overlay);
  assert.equal(mergeClaudeJson(Buffer.alloc(0), overlay), overlay);
});
