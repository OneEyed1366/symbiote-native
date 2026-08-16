// Proves the one genuinely novel, unverified-by-typecheck assumption in index.svelte: that
// `bind:this={hostShim}` on the intrinsic host tag has a populated `.engineNode` by the time
// the snap-back $effect first runs, so `dispatchViewCommand` has a live target. Compiles the
// REAL index.svelte source (not a hand-written stand-in) through svelte/compiler, wraps it in
// small controlling parents that either always reject or always accept a native toggle, and
// asserts against a real fake-Fabric recorder from @symbiote-native/test-utils.
//
// No Negative group: index.svelte has no throwing/rejecting path of its own — a value that
// fails `ISwitchProps`'s type is unreachable without an `as` cast (banned), and every branch
// inside the component (the echo gate, the snap-back predicate) resolves to "commit a prop" or
// "dispatch a command", never a throw. Every scenario below is grouped under one heading:
// completion of the controlled-value contract, split by whether native's report is accepted,
// rejected, or bound.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_002;
// Co-located with the real source (not an isolated temp dir): the compiled Switch output's
// own `import { PLATFORM } from './switch-platform'` resolves relative to WHERE THE COMPILED
// FILE LIVES, so it must sit next to the real switch-platform.ts/.ios.ts/.android.ts rather
// than being copied into isolation. .gitignore'd (`.smoke-compiled-*.mjs`); always removed in
// afterEach as belt-and-suspenders against a crash leaving one behind.
const SWITCH_OUT = join(__dirname, '.smoke-compiled-switch.mjs');
const REJECT_OUT = join(__dirname, '.smoke-compiled-reject-parent.mjs');
const ACCEPT_OUT = join(__dirname, '.smoke-compiled-accept-parent.mjs');
const BIND_OUT = join(__dirname, '.smoke-compiled-bind-parent.mjs');
const COLOR_OUT = join(__dirname, '.smoke-compiled-color-parent.mjs');

// The iOS mapping switch-platform.ts resolves to under vitest, spelled out so the assertions
// below read as the contract rather than as echoes of the source they check.
const TRACK_ON = '#81b0ff';
const TRACK_OFF = '#767577';
const THUMB = '#f5dd4b';
const IOS_BACKGROUND = '#3e3e3e';
const IOS_BACKGROUND_BORDER_RADIUS = 16;
const STYLE_MARGIN_TOP = 8;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(SWITCH_OUT, { force: true });
  rmSync(REJECT_OUT, { force: true });
  rmSync(ACCEPT_OUT, { force: true });
  rmSync(BIND_OUT, { force: true });
  rmSync(COLOR_OUT, { force: true });
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
  experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
} as const;

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

// `fabric.find()` walks the CREATION log — the original `createNode`'d object, whose `.props`
// is frozen at first-commit time (cloneNodeWithNewProps always returns a NEW object, never
// mutates in place; see fake-fabric.ts's own header comment). A post-update read of a live
// prop value must instead walk the LATEST committed tree — the same convention every other
// adapter's post-update smoke test uses (e.g. adapters/vue/src/runtime-helpers/runtime-
// helpers.test.ts).
function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function committedSwitch(): IFakeNode {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === 'Switch') found = node;
  });
  expect(found, 'a Switch was committed').toBeDefined();
  if (found === undefined) throw new Error('unreachable: Switch missing');
  return found;
}

function compileSwitch(): void {
  const switchSource = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  compileToFile(switchSource, 'Switch.svelte', SWITCH_OUT);
}

// A controlling parent that RENDERS the fixed prop it was given and NEVER updates it in
// onValueChange — the "parent rejects every toggle" case shouldSnapBack exists for.
async function loadRejectingMountable(): Promise<Component> {
  compileSwitch();
  compileToFile(
    `<script>
       import Switch from './.smoke-compiled-switch.mjs';
       let { fixedValue = false } = $props();
     </script>
     <Switch value={fixedValue} onValueChange={() => {}} />`,
    'RejectingParent.svelte',
    REJECT_OUT,
  );

  const mod: unknown = await import(`file://${REJECT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('RejectingParent.svelte produced no default export');
  }
  return mod.default as Component;
}

// A parent that ACCEPTS every native report by writing it straight back into its own state —
// the mirror-image case of RejectingParent, and the counterpart shouldSnapBack's own contract
// depends on: it must stay silent once `value` has caught up with what native reported.
async function loadAcceptingMountable(): Promise<Component> {
  compileSwitch();
  compileToFile(
    `<script>
       import Switch from './.smoke-compiled-switch.mjs';
       let { fixedValue = false } = $props();
       let value = $state(fixedValue);
     </script>
     <Switch value={value} onValueChange={(next) => { value = next; }} />`,
    'AcceptingParent.svelte',
    ACCEPT_OUT,
  );

  const mod: unknown = await import(`file://${ACCEPT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('AcceptingParent.svelte produced no default export');
  }
  return mod.default as Component;
}

// A `bind:value` consumer with NO onValueChange — the shape the gate in index.svelte's
// handleChange exists for (see its own comment): nothing else could reject a native report, so
// the echo is expected to fire and `boundValue` should track the toggle with no command needed.
async function loadBindMountable(): Promise<Component> {
  compileSwitch();
  compileToFile(
    `<script>
       import Switch from './.smoke-compiled-switch.mjs';
       let { fixedValue = false, onRead } = $props();
       let boundValue = $state(fixedValue);
       $effect(() => { onRead?.(boundValue); });
     </script>
     <Switch bind:value={boundValue} />`,
    'BindParent.svelte',
    BIND_OUT,
  );

  const mod: unknown = await import(`file://${BIND_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('BindParent.svelte produced no default export');
  }
  return mod.default as Component;
}

// Every prop shape that Svelte's own attribute machinery would mangle if the adapter ever
// stopped routing props through the single `p={bag}` property: an `on`-prefixed COLOR and an
// object `style`. See the colour test below for what each one proves.
async function loadColorMountable(): Promise<Component> {
  compileSwitch();
  compileToFile(
    `<script>
       import Switch from './.smoke-compiled-switch.mjs';
     </script>
     <Switch
       value={true}
       onValueChange={() => {}}
       trackColor={{ true: '${TRACK_ON}', false: '${TRACK_OFF}' }}
       thumbColor="${THUMB}"
       ios_backgroundColor="${IOS_BACKGROUND}"
       style={{ marginTop: ${STYLE_MARGIN_TOP} }} />`,
    'ColorParent.svelte',
    COLOR_OUT,
  );

  const mod: unknown = await import(`file://${COLOR_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('ColorParent.svelte produced no default export');
  }
  return mod.default as Component;
}

describe('Switch (real compiled index.svelte)', () => {
  // why: the initial commit must reflect whatever value the parent seeded, proving the
  // `fabricValue` fold + renderSwitch() wiring reaches the real intrinsic tag through the
  // DOM-shim custom-element codegen, not just through a hand-written stand-in.
  it('mounts and paints the intrinsic symbiote-switch node with the fixed value', async () => {
    const RejectingParent = await loadRejectingMountable();
    mount(ROOT_TAG, RejectingParent, { fixedValue: true });
    await tick();
    await tick();

    const node = fabric.find(n => n.viewName === 'Switch');
    expect(node).toBeDefined();
    expect(node?.props.value).toBe(true);
  });

  // why: native is optimistic — it flips its own grip before JS approves. When the parent's
  // onValueChange is a no-op, `value` never changes, so the retained tree never diverges and
  // nothing would re-commit on its own; the imperative snap-back command is the only path that
  // corrects native's grip back to what JS actually holds (shouldSnapBack's whole reason to
  // exist, per core/components/src/state/switch.ts).
  it('dispatches the snap-back command when native reports a value the parent rejects', async () => {
    const RejectingParent = await loadRejectingMountable();
    mount(ROOT_TAG, RejectingParent, { fixedValue: false });
    await tick();
    await tick();

    const node = fabric.find(n => n.viewName === 'Switch');
    expect(node).toBeDefined();
    if (node === undefined) return;

    // Native flips to true; the parent's onValueChange is a no-op, so `value` stays false —
    // this is exactly the case shouldSnapBack() exists to correct.
    fabric.fireEvent(node.instanceHandle, 'topChange', { value: true, eventCount: 1 });
    await tick();
    await tick();

    expect(fabric.commands).toHaveLength(1);
    expect(fabric.commands[0]?.commandName).toBe('setValue');
    expect(fabric.commands[0]?.args).toEqual([false]);
  });

  // why: the counterpart of the test above — shouldSnapBack must NOT fire once the parent's
  // own state has caught up with what native reported. A parent that accepts every toggle by
  // writing it back into `value` proves the effect is keyed on divergence, not on "a change
  // happened": a naive implementation that snapped back unconditionally on every native report
  // would fight an accepting parent forever.
  it('does not dispatch a snap-back command once the parent accepts the native report', async () => {
    const AcceptingParent = await loadAcceptingMountable();
    mount(ROOT_TAG, AcceptingParent, { fixedValue: false });
    await tick();
    await tick();

    const node = fabric.find(n => n.viewName === 'Switch');
    expect(node).toBeDefined();
    if (node === undefined) return;

    fabric.fireEvent(node.instanceHandle, 'topChange', { value: true, eventCount: 1 });
    await tick();
    await tick();

    expect(committedSwitch().props.value).toBe(true);
    expect(fabric.commands).toHaveLength(0);
  });

  // why: a `bind:value` caller supplies no onValueChange at all, so nothing could ever reject
  // native's report — the echo in handleChange exists precisely so a bound variable still
  // tracks the toggle, without the caller wiring a manual accept handler.
  it('round-trips a native toggle into a `bind:value` variable with no snap-back command', async () => {
    const reads: boolean[] = [];
    const BindParent = await loadBindMountable();
    mount(ROOT_TAG, BindParent, {
      fixedValue: false,
      onRead: (v: boolean) => reads.push(v),
    });
    await tick();
    await tick();

    expect(reads.at(-1)).toBe(false);

    const node = fabric.find(n => n.viewName === 'Switch');
    expect(node).toBeDefined();
    if (node === undefined) return;

    // Native flips to true; there is no onValueChange to arbitrate, so the bindable echo in
    // handleChange must fire and `boundValue` (read back via onRead) must follow it — with no
    // corrective `setValue` command, since nothing ever disagreed with native's report.
    fabric.fireEvent(node.instanceHandle, 'topChange', { value: true, eventCount: 1 });
    await tick();
    await tick();

    expect(reads.at(-1)).toBe(true);
    expect(fabric.commands).toHaveLength(0);
  });

  // why: `onTintColor` is the one prop in the whole component surface whose NAME lies about its
  // kind — a framework that infers events from an `on` prefix eats it and iOS loses its ON-track
  // colour. Nothing here does: props ride to the host as one object through `p={bag}`, so Svelte
  // never inspects a key, and the engine decides prop-vs-listener from Switch's ViewConfig, which
  // declares `change` as its only event (core/engine/src/view-config.ts). React, Vue and Angular
  // each pin this; Svelte did not, and the seam it depends on is Svelte-specific.
  //
  // The same mount pins the object `style`: `set_custom_element_data` stringifies a scalar and
  // hard-excludes `style`, so a style that ever reached it as an ATTRIBUTE would arrive as
  // "[object Object]" and every key below would be missing. They land flattened, which is proof
  // the object went through the property path instead.
  it('lands the on-prefixed track colour and an object style as PROPS, not as an event', async () => {
    const ColorParent = await loadColorMountable();
    mount(ROOT_TAG, ColorParent, {});
    await tick();
    await tick();

    const props = committedSwitch().props;
    expect(props.onTintColor).toBe(TRACK_ON);
    expect(props.tintColor).toBe(TRACK_OFF);
    expect(props.thumbTintColor).toBe(THUMB);
    // ios_backgroundColor folds into the style array (render-switch.ts's foldIosBackground), so
    // seeing both it and the caller's own margin proves the whole array flattened, not just the
    // last entry.
    expect(props.marginTop).toBe(STYLE_MARGIN_TOP);
    expect(props.backgroundColor).toBe(IOS_BACKGROUND);
    expect(props.borderRadius).toBe(IOS_BACKGROUND_BORDER_RADIUS);
  });
});
