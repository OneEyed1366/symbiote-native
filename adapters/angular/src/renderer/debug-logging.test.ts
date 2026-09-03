// The renderer's hot-path `dlog` calls build their message with template literals and
// `describeHost`, and an ARGUMENT is evaluated before the callee's own `isDebug()` gate can
// refuse it — so on a 1 000-row create those strings were built ~20 000 times in a Release build
// that emits none of them. No other adapter's renderer logs on these paths at all (vue: zero
// `dlog` sites, svelte: zero, solid: one), so this was Angular-only weight in pass 1.
//
// Wrapping each site in `if (isDebug())` is the form the file already uses for
// `tagAnchorForDebug`, and it allocates nothing — unlike the thunk overload `dlog` also accepts.
//
// The saving itself is only visible on device. What IS testable, and what this pins, is that the
// gate did not silently cost us the diagnostics: same messages when DEBUG is on, silence when off.
import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';

const ROOT_TAG = 941;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'debug-log-host',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-view testID="probe"
    ><symbiote-text>hi</symbiote-text></symbiote-view
  >`,
})
class DebugLogHost {}

async function rendererLines(debugOn: boolean): Promise<string[]> {
  globalThis.__SYMBIOTE_DEBUG__ = debugOn;
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    fabric.reset();
    mount(ROOT_TAG, DebugLogHost);
    await tick();
    return spy.mock.calls
      .map(call => String(call[0]))
      .filter(line => line.includes('Angular renderer'));
  } finally {
    spy.mockRestore();
    unmount(ROOT_TAG);
    globalThis.__SYMBIOTE_DEBUG__ = false;
  }
}

beforeEach(() => fabric.reset());
afterEach(() => {
  globalThis.__SYMBIOTE_DEBUG__ = false;
});

// Every `dlog(` in the renderer must sit inside an `if (isDebug())` block. This is a SOURCE
// assertion on purpose: the runtime cannot tell the two apart, because `dlog` gates itself, so a
// removed outer gate emits exactly nothing either way and every behavioural probe stays green.
// The cost being guarded is the ARGUMENT, which no observer sees.
function ungatedDlogLines(source: string): number[] {
  const gated: [number, number][] = [];
  const opener = /if \(isDebug\(\)\) \{/g;
  for (let hit = opener.exec(source); hit !== null; hit = opener.exec(source)) {
    let depth = 0;
    let index = hit.index + hit[0].length - 1;
    for (; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      else if (source[index] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    gated.push([hit.index, index]);
  }

  const ungated: number[] = [];
  const call = /\bdlog\(/g;
  for (let hit = call.exec(source); hit !== null; hit = call.exec(source)) {
    const inside = gated.some(
      ([start, end]) => hit.index > start && hit.index < end,
    );
    if (!inside) ungated.push(source.slice(0, hit.index).split('\n').length);
  }
  return ungated;
}

describe('renderer diagnostics', () => {
  it('builds no log message unless DEBUG is on', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(ungatedDlogLines(source)).toEqual([]);
  });

  it('still logs appendChild under DEBUG', async () => {
    const lines = await rendererLines(true);
    expect(lines.some(line => line.includes('appendChild'))).toBe(true);
  });

  it('says nothing with DEBUG off', async () => {
    expect(await rendererLines(false)).toEqual([]);
  });
});
