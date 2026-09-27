// Ported verbatim from expo-file-system's own vendored copy (Copyright Joyent, Inc. and other
// Node contributors, MIT licensed) — url-encoding helpers used when a path is a `file://`/URL
// rather than a bare posix path.

import { resolve, sep } from './node-path';

const percentRegEx = /%/g;
const backslashRegEx = /\\/g;
const newlineRegEx = /\n/g;
const carriageReturnRegEx = /\r/g;
const tabRegEx = /\t/g;
const questionRegex = /\?/g;
const hashRegex = /#/g;
const spaceRegEx = / /g;

function encodePathChars(filepath: string) {
  if (filepath.indexOf('%') !== -1)
    filepath = filepath.replace(percentRegEx, '%25');
  if (filepath.indexOf('\\') !== -1)
    filepath = filepath.replace(backslashRegEx, '%5C');
  if (filepath.indexOf('\n') !== -1)
    filepath = filepath.replace(newlineRegEx, '%0A');
  if (filepath.indexOf('\r') !== -1)
    filepath = filepath.replace(carriageReturnRegEx, '%0D');
  if (filepath.indexOf('\t') !== -1)
    filepath = filepath.replace(tabRegEx, '%09');
  if (filepath.indexOf(' ') !== -1)
    filepath = filepath.replace(spaceRegEx, '%20');
  return filepath;
}

export function encodeURLChars(path: string) {
  let resolved = resolve(path);
  const filePathLast = path.charAt(path.length - 1);
  if (filePathLast === '/' && resolved[resolved.length - 1] !== sep)
    resolved += '/';

  resolved = encodePathChars(resolved);

  if (resolved.indexOf('?') !== -1)
    resolved = resolved.replace(questionRegex, '%3F');
  if (resolved.indexOf('#') !== -1)
    resolved = resolved.replace(hashRegex, '%23');
  return resolved;
}

export function isUrl(url: string) {
  try {
    return !!new URL(url);
  } catch {
    return false;
  }
}

export function asUrl(url: string | URL) {
  try {
    const parsed = new URL(url);
    if (parsed.hash === '') {
      return parsed;
    }
    // Strip the hash by reconstructing rather than assigning `.hash = ''` — this project's
    // resolved `URL` type declares its setters read-only (see path-utilities.ts's own note).
    const hashIndex = parsed.href.indexOf('#');
    return new URL(
      hashIndex === -1 ? parsed.href : parsed.href.slice(0, hashIndex),
    );
  } catch {
    return null;
  }
}
