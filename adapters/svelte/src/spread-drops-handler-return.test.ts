// A handler's RETURN VALUE must survive each of the three ways a host tag gets its attributes
// The responder negotiation is a vote: `findWantsResponder` (core/engine/src/events/index.ts)
// grants the gesture to the first node whose `onStartShouldSetResponder` returns `true`

// The three arms are the point: with the named and bag arms passing, a failing spread arm
// cannot be the harness failing to read a return at all
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'svelte/compiler';
import type { Component } from 'svelte';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { ISymbioteNode } from '@symbiote-native/engine';
import './register';
import { mount } from './render';
import { hostInstance } from './host-instance';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

installRecordingFabric();
const ROOT_TAG = 9_702;
// `-for-<consumer>` per .claude/rules/smoke-compiled-artifact-collisions.md
const OUT = join(__dirname, '.smoke-compiled-spread-return-for-spread.mjs');

// A literal closing script tag in this file breaks vite's import analysis, so it is built apart
const SCRIPT_CLOSE = ['<', '/script>'].join('');
const FIXTURE = [
  '<script>',
  '  const bag = { onStartShouldSetResponder: () => true };',
  '  const keep = name => node => { globalThis[name] = node; };',
  SCRIPT_CLOSE,
  '<view {@attach keep("__spread")} {...bag} />',
  '<view {@attach keep("__named")} onStartShouldSetResponder={() => true} />',
  '<view {@attach keep("__bagged")} p={bag} />',
].join('\n');

// What the ENGINE reads when it asks the node whether it wants the gesture, the same call
// `callOwnListener` makes
function answersWantsGesture(global: string): unknown {
  const host: ISymbioteNode | undefined = hostInstance(
    Reflect.get(globalThis, global),
  );
  if (host === undefined) throw new Error(`${global} never bound a host node`);
  const listener = host.listeners?.get('startShouldSetResponder');
  if (listener === undefined)
    throw new Error(`${global} installed no startShouldSetResponder listener`);
  return listener({
    type: 'startShouldSetResponder',
    target: host,
    currentTarget: host,
    nativeEvent: {},
    stopPropagation: () => {},
  });
}

beforeAll(async () => {
  writeFileSync(
    OUT,
    compile(FIXTURE, {
      generate: 'client',
      fragments: 'tree',
      css: 'external',
      filename: 'SpreadReturn.svelte',
    }).js.code,
  );
  const mod: unknown = await import(`file://${OUT}`);
  mount(ROOT_TAG, (mod as { default: Component }).default);
  await new Promise(resolve => setTimeout(resolve, 0));
});

afterAll(() => {
  rmSync(OUT, { force: true });
});

describe("a host tag's three attribute doors, by whether a return survives", () => {
  it('keeps the answer through a named attribute', () => {
    expect(answersWantsGesture('__named')).toBe(true);
  });

  it('keeps the answer through the bag', () => {
    expect(answersWantsGesture('__bagged')).toBe(true);
  });

  // KNOWN upstream defect, not fixed here: `set_attributes` wraps the handler without returning
  // When Svelte returns from the wrapper this goes red and the caveat in AnimatedParityDemo can go
  it('KNOWN: drops the answer through a spread', () => {
    expect(answersWantsGesture('__spread')).toBe(undefined);
  });
});
