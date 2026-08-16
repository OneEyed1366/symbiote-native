// Proves the genuinely novel, unverified-by-typecheck assumptions in index.svelte, the
// TextInput twin of switch.smoke.test.ts: the controlled-value snap-back (a parent that rejects
// every native change must see a real `setTextAndSelection` command echoing the acknowledged
// event count and the parent's own unchanged value), the imperative handle exported as plain
// instance-script functions being genuinely callable off a parent's `bind:this` target, the
// autoFocus effect driving a real `focus` command exactly once, and the selection-fallback
// arithmetic feeding a controlled write. Compiles the REAL index.svelte source (not a
// hand-written stand-in) through svelte/compiler and asserts against a real fake-Fabric
// recorder.
//
// No Negative group: index.svelte has no throwing/rejecting path of its own — a value that
// fails `ITextInputProps`'s type is unreachable without an `as` cast (banned), and every branch
// (the echo gate, shouldCommandText, the autoFocus guard) resolves to "commit a prop" or
// "dispatch a command", never a throw. Every scenario below completes the controlled-value /
// event-count handshake contract from a different angle.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import type { ITextInputHandle } from '@symbiote-native/components';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_003;
const SINGLELINE = 'RCTSinglelineTextInputView';
const MULTILINE = 'RCTMultilineTextInputView';
const ACK_COUNT = 7;
// Co-located with the real source (not an isolated temp dir): the compiled TextInput output's
// own relative imports (e.g. into shared engine/components packages) resolve relative to WHERE
// THE COMPILED FILE LIVES, matching switch.smoke.test.ts's rationale. .gitignore'd
// (`.smoke-compiled-*.mjs`); always removed in afterEach as belt-and-suspenders against a crash
// leaving one behind.
const TEXT_INPUT_OUT = join(__dirname, '.smoke-compiled-text-input.mjs');
const CAPTURE_OUT = join(__dirname, '.smoke-compiled-capture-parent.mjs');
const BIND_OUT = join(__dirname, '.smoke-compiled-bind-parent.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TEXT_INPUT_OUT, { force: true });
  rmSync(CAPTURE_OUT, { force: true });
  rmSync(BIND_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

// `fabric.find()` walks the CREATION log — the original `createNode`'d object, whose `.props`
// is frozen at first-commit time (cloneNodeWithNewProps always returns a NEW object, never
// mutates in place; see fake-fabric.ts's own header comment). Fine for a one-shot initial-paint
// assertion; a post-update prop read must instead walk the LATEST committed tree.
function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function committedTextInput(): IFakeNode {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === SINGLELINE || node.viewName === MULTILINE) found = node;
  });
  expect(found, 'a TextInput was committed').toBeDefined();
  if (found === undefined) throw new Error('unreachable: TextInput missing');
  return found;
}

// A capturing parent: renders TextInput with a FIXED value and an onValueChange that never
// updates it (so every native change is "rejected", exactly the case shouldCommandText exists to
// correct), forwards onFocus/onBlur/selection/autoFocus straight through so a test can supply
// whichever it needs, and hands the imperative handle out through a plain callback prop once
// bind:this resolves — no shared-module trick needed, since the callback closes over whatever the
// TEST passed in as a `mount()` prop (proven safe by the same pattern switch.smoke.test.ts uses
// for onValueChange).
async function loadMountable(): Promise<Component> {
  const textInputSource = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  compileToFile(textInputSource, 'TextInput.svelte', TEXT_INPUT_OUT);

  compileToFile(
    `<script>
       import TextInput from './.smoke-compiled-text-input.mjs';
       let {
         fixedValue = '',
         multiline = false,
         autoFocus = false,
         selection = undefined,
         onCapture,
         onFocus,
         onBlur,
       } = $props();
       let handle = $state.raw(null);
       $effect(() => {
         if (handle !== null) onCapture?.(handle);
       });
     </script>
     <TextInput
       value={fixedValue}
       multiline={multiline}
       autoFocus={autoFocus}
       selection={selection}
       onValueChange={() => {}}
       onFocus={onFocus}
       onBlur={onBlur}
       bind:this={handle}
     />`,
    'CapturingParent.svelte',
    CAPTURE_OUT,
  );

  const mod: unknown = await import(`file://${CAPTURE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('CapturingParent.svelte produced no default export');
  }
  return mod.default as Component;
}

// A `bind:value` consumer with NO onValueChange — the shape the gate in index.svelte's
// handleChange exists for (see its own comment): nothing else could reject a native report, so
// the echo is expected to fire and `boundValue` should track every keystroke with no
// setTextAndSelection correction dispatched.
async function loadBindMountable(): Promise<Component> {
  const textInputSource = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  compileToFile(textInputSource, 'TextInput.svelte', TEXT_INPUT_OUT);

  compileToFile(
    `<script>
       import TextInput from './.smoke-compiled-text-input.mjs';
       let { fixedValue = '', onRead } = $props();
       let boundValue = $state(fixedValue);
       $effect(() => { onRead?.(boundValue); });
     </script>
     <TextInput bind:value={boundValue} />`,
    'BindParent.svelte',
    BIND_OUT,
  );

  const mod: unknown = await import(`file://${BIND_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('BindParent.svelte produced no default export');
  }
  return mod.default as Component;
}

describe('TextInput (real compiled index.svelte)', () => {
  // why: the initial commit must reflect the seeded controlled value and a real numeric event
  // count, proving the `text`/`mostRecentEventCount` fold reaches the real intrinsic tag through
  // the DOM-shim custom-element codegen, not just through a hand-written stand-in.
  it('mounts and paints the singleline intrinsic with the seeded controlled value', async () => {
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, { fixedValue: 'hi' });
    await tick();
    await tick();

    const node = fabric.find(n => n.viewName === SINGLELINE);
    expect(node).toBeDefined();
    expect(node?.props.text).toBe('hi');
    expect(typeof node?.props.mostRecentEventCount).toBe('number');
  });

  // why: `multiline` picks between two literal host tags at compile time (deliberately NOT
  // `<svelte:element>` — see the module-header comment on why a dynamic tag would miss the
  // custom-element codegen path) — proving exactly one of the two is ever committed.
  it('selects the multiline intrinsic when multiline is set', async () => {
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, { fixedValue: 'x', multiline: true });
    await tick();
    await tick();

    expect(fabric.find(n => n.viewName === MULTILINE)).toBeDefined();
    expect(fabric.find(n => n.viewName === SINGLELINE)).toBeUndefined();
  });

  // why: native is optimistic about the user's keystroke before JS approves it. When the
  // parent's onValueChange is a no-op, `value` never changes, so nothing would re-commit on its
  // own; the setTextAndSelection command carrying the ACKNOWLEDGED count is the only stale-safe
  // correction path (a plain prop re-push would race the user's cursor) — shouldCommandText's
  // whole reason to exist.
  it('commands setTextAndSelection with the acked count when the parent rejects a native change', async () => {
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, { fixedValue: '' });
    await tick();
    await tick();

    const node = fabric.find(n => n.viewName === SINGLELINE);
    expect(node).toBeDefined();
    if (node === undefined) return;

    // Native reports "ab" at ACK_COUNT; the parent's onValueChange is a no-op, so `value` stays
    // "" — this is exactly the divergence shouldCommandText() exists to correct.
    fabric.fireEvent(node.instanceHandle, 'topChange', {
      text: 'ab',
      eventCount: ACK_COUNT,
      selection: { start: 2, end: 2 },
    });
    await tick();
    await tick();

    const setText = fabric.commands.find(c => c.commandName === 'setTextAndSelection');
    expect(setText, 'a setTextAndSelection command was dispatched').toBeDefined();
    expect(setText?.args).toEqual([ACK_COUNT, '', -1, -1]);
  });

  // why: the mount-time value is seeded into `lastNativeText` up front (foldText), so the FIRST
  // commit must never be mistaken for a divergence — else every TextInput would issue a spurious
  // correction command against its own initial value on mount.
  it('issues no controlled-write command on mount (value equals the seed)', async () => {
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, { fixedValue: 'seed' });
    await tick();
    await tick();

    expect(fabric.commands.some(c => c.commandName === 'setTextAndSelection')).toBe(false);
  });

  // why: a `topChange` payload that carries an eventCount but no `text` field (a real native
  // shape divergence the module-header comment calls out — iOS/Android can key the change
  // payload differently) must still land the acknowledged count, but must NOT be mistaken for a
  // text report: if `lastNativeText` were clobbered by the missing `text`, the next unrelated
  // commit would wrongly look like a divergence and fire a spurious correction.
  it('acknowledges the event count without touching text bookkeeping when `text` is absent', async () => {
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, { fixedValue: 'seed' });
    await tick();
    await tick();

    const node = fabric.find(n => n.viewName === SINGLELINE);
    expect(node).toBeDefined();
    if (node === undefined) return;

    fabric.fireEvent(node.instanceHandle, 'topChange', { eventCount: ACK_COUNT });
    await tick();
    await tick();

    expect(committedTextInput().props.mostRecentEventCount).toBe(ACK_COUNT);
    expect(fabric.commands.some(c => c.commandName === 'setTextAndSelection')).toBe(false);
  });

  // why: `selEnd` falls back to `selection.start` when the caller supplies a caret position with
  // no explicit end (RN's own SELECTION_NONE convention only applies when NEITHER is given) —
  // the one non-trivial arithmetic branch inside the controlled-write effect, not a passthrough.
  it('falls the command selection end back to start when the parent supplies no end', async () => {
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, { fixedValue: '', selection: { start: 3 } });
    await tick();
    await tick();

    const node = fabric.find(n => n.viewName === SINGLELINE);
    expect(node).toBeDefined();
    if (node === undefined) return;

    fabric.fireEvent(node.instanceHandle, 'topChange', { text: 'ab', eventCount: ACK_COUNT });
    await tick();
    await tick();

    const setText = fabric.commands.find(c => c.commandName === 'setTextAndSelection');
    expect(setText, 'a setTextAndSelection command was dispatched').toBeDefined();
    expect(setText?.args).toEqual([ACK_COUNT, '', 3, 3]);
  });

  // why: `autoFocus` is driven from JS (not a native prop) — once the host node first goes live
  // it must command `focus` exactly once, mirroring RN's own TextInputState.focusInput, with no
  // manual `.focus()` call from the test.
  it('commands focus once on mount when autoFocus is set', async () => {
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, { fixedValue: 'hi', autoFocus: true });
    await tick();
    await tick();

    expect(fabric.commands.filter(c => c.commandName === 'focus')).toHaveLength(1);
  });

  // why: the counterpart of the test above — no autoFocus prop must never issue a focus command
  // on its own; only an explicit imperative `.focus()` call (proven separately below) may.
  it('issues no focus command on mount when autoFocus is unset', async () => {
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, { fixedValue: 'hi' });
    await tick();
    await tick();

    expect(fabric.commands.some(c => c.commandName === 'focus')).toBe(false);
  });

  // why: the imperative handle is exported as plain instance-script functions (Svelte 5's
  // mechanism, no useImperativeHandle/expose() rune) — the DOM-shim identity concern
  // ($state.raw, not $state) must resolve through `bind:this` far enough for focus/blur/clear to
  // actually dispatch real view commands, not silently no-op.
  it('lands focus/blur/clear as view commands through the exported imperative handle', async () => {
    let captured: ITextInputHandle | null = null;
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, {
      fixedValue: 'hi',
      onCapture: (handle: ITextInputHandle) => {
        captured = handle;
      },
    });
    await tick();
    await tick();

    expect(captured, 'imperative handle captured after mount').not.toBeNull();
    // The engine node is held by IDENTITY ($state.raw), so the engine mirror resolves it and the
    // commands land; $state() would deep-proxy the shim element and every command would silently
    // no-op instead.
    captured?.focus();
    captured?.blur();
    await tick();

    expect(fabric.commands.some(c => c.commandName === 'focus')).toBe(true);
    expect(fabric.commands.some(c => c.commandName === 'blur')).toBe(true);

    captured?.clear();
    await tick();

    const clearCommand = fabric.commands.find(
      c => c.commandName === 'setTextAndSelection' && c.args[1] === '' && c.args[2] === 0,
    );
    expect(clearCommand, 'clear() dispatched setTextAndSelection([count, "", 0, 0])').toBeDefined();
  });

  // why: `setSelection` is part of the same imperative handle as focus/blur/clear but reuses the
  // setTextAndSelection command with the CURRENT text rather than an empty one — proving it is
  // wired at all (it had no coverage before this test) and that it echoes the caller's own
  // start/end verbatim, not the selection-fallback arithmetic the controlled-write effect uses.
  it('lands setSelection as setTextAndSelection with the current text and the given range', async () => {
    let captured: ITextInputHandle | null = null;
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, {
      fixedValue: 'hi',
      onCapture: (handle: ITextInputHandle) => {
        captured = handle;
      },
    });
    await tick();
    await tick();

    expect(captured).not.toBeNull();
    if (captured === null) return;

    captured.setSelection(1, 2);
    await tick();

    const setSelectionCommand = fabric.commands.find(
      c => c.commandName === 'setTextAndSelection' && c.args[2] === 1 && c.args[3] === 2,
    );
    expect(
      setSelectionCommand,
      'setSelection dispatched setTextAndSelection(…, 1, 2)',
    ).toBeDefined();
    expect(setSelectionCommand?.args[1]).toBe('hi');
  });

  // why: focus/blur events must reach the app's own onFocus/onBlur callbacks, not just flip the
  // internal `focused` bookkeeping isFocused() reads — this is the one part of handleFocus/
  // handleBlur no other test in this file observes.
  it('invokes the parent onFocus/onBlur callbacks on native focus/blur events', async () => {
    const focusEvents: unknown[] = [];
    const blurEvents: unknown[] = [];
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, {
      fixedValue: 'hi',
      onFocus: (e: unknown) => focusEvents.push(e),
      onBlur: (e: unknown) => blurEvents.push(e),
    });
    await tick();
    await tick();

    const node = fabric.find(n => n.viewName === SINGLELINE);
    expect(node).toBeDefined();
    if (node === undefined) return;

    fabric.fireEvent(node.instanceHandle, 'topFocus', {});
    await tick();
    expect(focusEvents).toHaveLength(1);

    fabric.fireEvent(node.instanceHandle, 'topBlur', {});
    await tick();
    expect(blurEvents).toHaveLength(1);
  });

  // why: native exposes no synchronous focus getter (RN's own TextInputState keeps the same
  // limitation), so `isFocused()` must be reconstructed JS-side purely from the focus/blur event
  // pair — proving that mirror, not just that the callbacks fire.
  it('reflects focus/blur events through isFocused', async () => {
    let captured: ITextInputHandle | null = null;
    const CapturingParent = await loadMountable();
    mount(ROOT_TAG, CapturingParent, {
      fixedValue: 'hi',
      onCapture: (handle: ITextInputHandle) => {
        captured = handle;
      },
    });
    await tick();
    await tick();

    expect(captured).not.toBeNull();
    if (captured === null) return;
    expect(captured.isFocused()).toBe(false);

    const node = fabric.find(n => n.viewName === SINGLELINE);
    expect(node).toBeDefined();
    if (node === undefined) return;

    fabric.fireEvent(node.instanceHandle, 'topFocus', {});
    await tick();
    expect(captured.isFocused()).toBe(true);

    fabric.fireEvent(node.instanceHandle, 'topBlur', {});
    await tick();
    expect(captured.isFocused()).toBe(false);
  });

  // why: a `bind:value` caller supplies no onValueChange at all, so nothing could ever reject
  // native's report — the echo in handleChange exists precisely so a bound variable still
  // tracks every keystroke, without the caller wiring a manual accept handler.
  it('round-trips a native edit into a `bind:value` variable with no correction command', async () => {
    const reads: string[] = [];
    const BindParent = await loadBindMountable();
    mount(ROOT_TAG, BindParent, {
      fixedValue: '',
      onRead: (v: string) => reads.push(v),
    });
    await tick();
    await tick();

    expect(reads.at(-1)).toBe('');

    const node = fabric.find(n => n.viewName === SINGLELINE);
    expect(node).toBeDefined();
    if (node === undefined) return;

    // Native reports "ab"; there is no onValueChange to arbitrate, so the bindable echo in
    // handleChange must fire and `boundValue` (read back via onRead) must follow it — with no
    // corrective setTextAndSelection command, since nothing ever disagreed with native's report.
    fabric.fireEvent(node.instanceHandle, 'topChange', {
      text: 'ab',
      eventCount: ACK_COUNT,
      selection: { start: 2, end: 2 },
    });
    await tick();
    await tick();

    expect(reads.at(-1)).toBe('ab');
    expect(fabric.commands.some(c => c.commandName === 'setTextAndSelection')).toBe(false);
  });
});
