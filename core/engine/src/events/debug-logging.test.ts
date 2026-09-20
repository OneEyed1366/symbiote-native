// No event may build a log message that nothing will print.
//
// `dlog` gates itself, but an ARGUMENT is evaluated before the callee can refuse it — so a template
// literal beside a `dlog` is built on every event in a Release build that emits none of them. The
// project has priced this exact defect once already, on Angular's renderer: nine sites, and gating
// them moved four device rows 5-25% (`CLAUDE.md`, "A `dlog` ARGUMENT is not gated").
//
// THIS MODULE IS A WIDER SURFACE THAN THAT ONE. The Angular fix was adapter-local and got an
// adapter-local guard (`adapters/angular/src/renderer/debug-logging.test.ts`), which is why nobody
// looked here: the event dispatcher is shared by all five adapters and runs PER EVENT, including
// `topScroll`, which fires every frame of a drag. It had twenty `dlog` sites, fourteen of them
// building a string, and not one `isDebug()` in the file.
//
// WHAT THIS ASSERTS AND WHY IT IS NARROWER THAN ANGULAR'S. Angular's version requires every `dlog(`
// to sit inside a gate. The cost being guarded is the argument, and a CONSTANT string is not built
// — `dlog('event press -> dispatch')` allocates nothing and reads better ungated. So this flags
// only a call whose argument is COMPUTED: a template literal or a concatenation. Targeting the
// defect rather than the call is what keeps the rule from turning into noise nobody obeys.
//
// A SOURCE assertion on purpose, exactly as Angular's is: the runtime cannot tell a gated site from
// an ungated one, because `dlog` refuses either way and every behavioural probe stays green. What is
// being guarded is work no observer sees.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** Spans of `if (isDebug()) { … }` and of a braceless `if (isDebug()) <statement>;`. */
function gatedSpans(source: string): [number, number][] {
  const spans: [number, number][] = [];
  const opener = /if \(isDebug\(\)\)\s*/g;
  for (let hit = opener.exec(source); hit !== null; hit = opener.exec(source)) {
    const after = hit.index + hit[0].length;
    if (source[after] === '{') {
      let depth = 0;
      let index = after;
      for (; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        else if (source[index] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      spans.push([hit.index, index]);
      continue;
    }
    // Braceless: the guarded statement runs to its terminating semicolon at paren depth zero.
    let depth = 0;
    let index = after;
    for (; index < source.length; index += 1) {
      const at = source[index];
      if (at === '(') depth += 1;
      else if (at === ')') depth -= 1;
      else if (at === ';' && depth === 0) break;
    }
    spans.push([hit.index, index]);
  }
  return spans;
}

/** The argument text of a `dlog(` call, read to its matching close paren. */
function argumentOf(source: string, callIndex: number): string {
  let depth = 0;
  let index = callIndex + 'dlog'.length;
  const start = index;
  for (; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return source.slice(start, index);
}

function ungatedComputedDlogLines(source: string): number[] {
  const spans = gatedSpans(source);
  const lines: number[] = [];
  const call = /\bdlog\(/g;
  for (let hit = call.exec(source); hit !== null; hit = call.exec(source)) {
    const argument = argumentOf(source, hit.index);
    const isComputed = argument.includes('`') || argument.includes(' + ');
    if (!isComputed) continue;
    const gated = spans.some(
      ([from, to]) => hit.index > from && hit.index < to,
    );
    if (!gated) lines.push(source.slice(0, hit.index).split('\n').length);
  }
  return lines;
}

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('the event dispatcher builds no message nothing will print', () => {
  it('gates every dlog whose argument is computed', () => {
    expect(ungatedComputedDlogLines(source)).toEqual([]);
  });

  // The reader has to be shown capable of finding one, or an empty list means nothing — the same
  // standard this investigation applies to every counter that reads zero.
  it('finds an ungated computed call when there is one', () => {
    expect(
      ungatedComputedDlogLines('const x = 1;\ndlog(`value ${x}`);\n'),
    ).toEqual([2]);
    expect(ungatedComputedDlogLines("dlog('a ' + 'b');\n")).toEqual([1]);
  });

  // And it must NOT flag the two shapes that are correct, or it would push people to gate constants.
  it('accepts a constant argument and a gated computed one', () => {
    expect(ungatedComputedDlogLines("dlog('plain');\n")).toEqual([]);
    expect(
      ungatedComputedDlogLines('if (isDebug()) dlog(`a ${1}`);\n'),
    ).toEqual([]);
    expect(
      ungatedComputedDlogLines('if (isDebug()) {\n  dlog(`a ${1}`);\n}\n'),
    ).toEqual([]);
  });

  // The module still has diagnostics worth keeping: gating must not have deleted them.
  it('still carries its event-dispatch diagnostics', () => {
    expect(source).toContain('(direct)');
    expect(source).toContain('UNMATCHED');
  });
});
