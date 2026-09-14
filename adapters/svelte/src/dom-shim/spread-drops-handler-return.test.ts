// A spread on a host TAG loses a handler's RETURN VALUE. The bag and a named attribute keep it.
//
// This is Svelte's, not ours. `{...bag}` on an element compiles to `attribute_effect` ->
// `set_attributes`, whose `on*` branch wraps the value:
//
//   function handle(evt) { current[key].call(this, evt); }        <- attributes.js:423, no return
//   current['$$' + key] = create_event(event_name, element, handle, opts);
//
// `create_event` itself returns what its handler returns, which is why the two other doors are
// fine — only this wrapper is lossy. For a DOM event nothing reads the return, so upstream has no
// reason to notice.
//
// WHY IT MATTERS HERE. The responder negotiation is a VOTE: `findWantsResponder` grants the
// gesture to the first node whose `onStartShouldSetResponder` returns `true`
// (`core/engine/src/events/index.ts`). A handler whose answer is swallowed reads as "does not
// want it", so a spread element asks for every gesture and is never heard.
//
// Device-diagnosed 2026-09-08 on the canary's PanResponder drag box: `PanResponder
// startShouldSet -> true` immediately followed by `responder start: nobody wants it (path=11)` —
// the listener ran, and its answer did not survive the trip.
//
// The three arms are the point: two of them PASS, and without them "spread returns undefined"
// could equally be the harness failing to read a return at all.
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'svelte/compiler';
import type { Component } from 'svelte';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import type { ISymbioteNode } from '@symbiote-native/engine';
import '../register';
import { mount } from '../render';
import { hostInstance } from '../host-instance';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

installFabric();
const ROOT_TAG = 9702;
// `-for-<consumer>` per .claude/rules/smoke-compiled-artifact-collisions.md: no other suite may
// share this path, and a probe copied from this header must rename it too.
const OUT = join(__dirname, '.smoke-compiled-spread-return-for-spread.mjs');

// `</script>` inside a template literal breaks vite's import analysis of this very file, so the
// fixture is assembled from lines rather than written as one.
const FIXTURE = [
  '<script>',
  '  const bag = { onStartShouldSetResponder: () => true };',
  '  let spread = $state.raw(null);',
  '  let named = $state.raw(null);',
  '  let bagged = $state.raw(null);',
  '  $effect(() => {',
  '    globalThis.__spread = spread;',
  '    globalThis.__named = named;',
  '    globalThis.__bagged = bagged;',
  '  });',
  '<' + '/script>',
  '<view bind:this={spread} {...bag} />',
  '<view bind:this={named} onStartShouldSetResponder={() => true} />',
  '<view bind:this={bagged} p={bag} />',
].join('\n');

// What the ENGINE would read when it asks the node whether it wants the gesture — the same call
// `callOwnListener` makes, not a re-implementation of it.
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

  // Pinned as a KNOWN upstream defect rather than fixed: the wrapper is built inside
  // `set_attributes`, so the original handler never reaches any code of ours. The day Svelte
  // returns from `handle`, this goes red and the caveat in `examples/svelte/components/
  // AnimatedParityDemo.svelte` — and the note in the shim rule — can go with it.
  it('KNOWN: drops the answer through a spread', () => {
    expect(answersWantsGesture('__spread')).toBeUndefined();
  });
});
