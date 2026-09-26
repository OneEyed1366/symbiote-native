// How many log messages this repository builds that nothing will print, and a ceiling on it.
//
// `dlog` gates itself, but an ARGUMENT is evaluated before the callee can refuse it, so a template
// literal beside a `dlog` is built in a Release build that emits none of them. The project has
// priced that once, on Angular's renderer: nine sites, and gating them moved four device rows
// 5-25% (`CLAUDE.md`, "A `dlog` ARGUMENT is not gated").
//
// WHY THIS IS A BUDGET AND NOT A BAN. Scanned across `core`, `adapters` and `packages`: 347 ungated
// computed arguments in 121 files, of which **18 sit inside a loop at all**, and every one of those
// loops is small — a route list, a URL parse, a style value. None is on a per-NODE commit path.
// That is the whole reason Angular's case was expensive and these are not: its renderer logged once
// per `createElement`/`appendChild`/`insertBefore`, so a 1 000-row create built ~20 000 strings.
// A site that runs once per mount, or once per scroll frame, builds one.
//
// So gating all 347 would be several hundred edits of pure noise for arithmetic that does not
// support them, and the two places the cost was shown to be real are gated individually:
// `adapters/angular/src/renderer/index.ts` and `core/engine/src/events/index.ts`, each with its own
// source assertion next to it.
//
// What this file adds is the thing neither of those can: a CEILING. The class is real, it is
// invisible at runtime, and it grows one convenient template at a time. A new one is fine when it
// is deliberate — raise the number and say why in the commit.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCANNED_ROOTS = ['core', 'adapters', 'packages'];

// The two gated files are excluded from this count by being gated, not by being named.
const BUDGET = 347;

// `withFileTypes`, and it is a RACE FIX rather than a tidy-up — the same one
// `core/engine/src/load-time-registration.test.ts` carries, which this walk was written from and
// which was never swept back across. This walks `adapters/`, and the Svelte suites write a
// `.smoke-compiled-*.mjs` beside their own source and `rmSync` it in an `afterAll`, dozens of them
// by design. A separate `statSync` after `readdirSync` leaves a window where one can vanish between
// the listing and the stat, and `statSync` then throws ENOENT on an entry this function was about to
// discard for its extension anyway.
//
// It presents as a guard that passes alone and fails in a full parallel run — which is exactly how
// it was found: two clean full runs and then this file, after a change that touched neither. Asking
// for the type in the SAME syscall closes the window rather than catching the throw.
function sourceFiles(dir: string, out: string[]): void {
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const entry = dirent.name;
    if (entry === 'node_modules' || entry === 'build' || entry === 'build-ngc')
      continue;
    const full = join(dir, entry);
    if (dirent.isDirectory()) {
      sourceFiles(full, out);
      continue;
    }
    const isSource =
      (full.endsWith('.ts') || full.endsWith('.tsx')) &&
      !full.endsWith('.d.ts') &&
      // Neither a test nor a bench is ever in a bundle, so neither can pay this cost — the same
      // exclusion, for the same reason, as `load-time-registration.test.ts`.
      !full.includes('.test.') &&
      !full.includes('.bench.');
    if (isSource) out.push(full);
  }
}

/** Spans of `if (isDebug()) { … }` and of a braceless `if (isDebug()) <statement>;`. */
function gatedSpans(source: string): [number, number][] {
  const spans: [number, number][] = [];
  const opener = /if \(isDebug\(\)\)\s*/g;
  for (let hit = opener.exec(source); hit !== null; hit = opener.exec(source)) {
    const after = hit.index + hit[0].length;
    let depth = 0;
    let index = after;
    if (source[after] === '{') {
      for (; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        else if (source[index] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
    } else {
      for (; index < source.length; index += 1) {
        const at = source[index];
        if (at === '(') depth += 1;
        else if (at === ')') depth -= 1;
        else if (at === ';' && depth === 0) break;
      }
    }
    spans.push([hit.index, index]);
  }
  return spans;
}

function ungatedComputedArguments(source: string): number {
  const spans = gatedSpans(source);
  let found = 0;
  const call = /\bdlog\(/g;
  for (let hit = call.exec(source); hit !== null; hit = call.exec(source)) {
    let depth = 0;
    let index = hit.index + 'dlog'.length;
    const start = index;
    for (; index < source.length; index += 1) {
      if (source[index] === '(') depth += 1;
      else if (source[index] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const argument = source.slice(start, index);
    // A CONSTANT string is not built — `dlog('press -> dispatch')` allocates nothing and reads
    // better ungated. Only a template literal or a concatenation costs anything.
    if (!argument.includes('`') && !argument.includes(' + ')) continue;
    if (spans.some(([from, to]) => hit.index > from && hit.index < to))
      continue;
    found += 1;
  }
  return found;
}

describe('log messages built where nothing will print', () => {
  it('stays inside its budget', () => {
    const files: string[] = [];
    for (const root of SCANNED_ROOTS) sourceFiles(join(REPO_ROOT, root), files);

    let total = 0;
    for (const file of files) {
      // THE SECOND listed-then-read window, and unlike the first it cannot be collapsed into one
      // syscall. Labelled rather than swallowed: skipping an unreadable file would turn a count this
      // guard exists to make into a quietly smaller one, and a bare ENOENT here reads as a mystery.
      // Same treatment `load-time-registration.test.ts` gives its own `parse()`.
      let source: string;
      try {
        source = readFileSync(file, 'utf8');
      } catch (cause) {
        throw new Error(
          `could not read ${file} — if this is ENOENT it is the .smoke-compiled-* race, not a finding`,
          { cause },
        );
      }
      if (!source.includes('dlog(')) continue;
      total += ungatedComputedArguments(source);
    }
    expect(total).toBeLessThanOrEqual(BUDGET);
  });

  // The budget is only worth having if the reader can read, and this repository is the wrong place
  // to prove that from — a green number over 121 files is indistinguishable from a broken scanner.
  it('counts an ungated computed argument and ignores the two correct shapes', () => {
    expect(ungatedComputedArguments('dlog(`a ${1}`);')).toBe(1);
    expect(ungatedComputedArguments("dlog('a ' + 'b');")).toBe(1);
    expect(ungatedComputedArguments("dlog('plain');")).toBe(0);
    expect(ungatedComputedArguments('if (isDebug()) dlog(`a ${1}`);')).toBe(0);
    expect(
      ungatedComputedArguments('if (isDebug()) {\n dlog(`a ${1}`);\n}'),
    ).toBe(0);
  });
});
