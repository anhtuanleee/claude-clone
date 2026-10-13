// Helpers for slicing and merging ~/.claude.json.

// The only ~/.claude.json fields exported by default. Everything else
// (themes, notification counters, project history, MCP settings, ...) is
// environment-specific UX state, not login state.
export const LOGIN_KEYS = ['oauthAccount', 'userID'];

function parseObject(text, label) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`parse ${label}: ${err.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`parse ${label}: top level is not an object`);
  }
  return parsed;
}

/**
 * Keep only `keys` from the JSON document. Missing keys are dropped silently.
 * @param {string|Buffer} input
 * @returns {string}
 */
export function filterClaudeJson(input, keys = LOGIN_KEYS) {
  const parsed = parseObject(input.toString(), '~/.claude.json');
  const picked = {};
  for (const k of keys) {
    if (Object.hasOwn(parsed, k)) picked[k] = parsed[k];
  }
  return JSON.stringify(picked, null, 2);
}

/**
 * Write the top-level keys of `overlay` on top of `base`.
 * An empty base returns the overlay verbatim.
 * @param {string|Buffer|null} base
 * @param {string|Buffer} overlay
 * @returns {string}
 */
export function mergeClaudeJson(base, overlay) {
  if (!base || base.length === 0) return overlay.toString();
  const baseObj = parseObject(base.toString(), 'existing ~/.claude.json');
  const overlayObj = parseObject(overlay.toString(), 'bundled ~/.claude.json');
  return JSON.stringify({ ...baseObj, ...overlayObj }, null, 2);
}
