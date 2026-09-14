// `pressable` as a TAG, through the REAL Svelte compiler. The press machine itself
// (createPressHandlers/createPressRuntime — the long-press timer, unstable_pressDelay, retention
// drift, suppression flags) lives on the engine node (`core/components/src/behaviors/pressable.ts`)
// and is fully unit-tested there; this file proves the SVELTE WIRING: compiled JSX-equivalent
// markup reaches the tag, the responder listeners land on the real host node, and app callbacks/
// a11y folding survive Svelte's compiled reactivity — the same bridge-smoke shape React's and
// Solid's Pressable suites already carry (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: nothing here throws. `disabled` suppresses a press silently (a Positive
// contract — completes without error, the callback just never fires), it never rejects.
import { afterAll, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what builds the press machine. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();

// Named for this suite alone — two suites sharing a compiled artifact race under a full run
// (`.claude/rules/smoke-compiled-artifact-collisions.md`).
const PROBE_OUT = join(__dirname, '.smoke-compiled-pressable-tag.mjs');

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const TERMINATION_REQUEST = 'responderTerminationRequest';

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

interface ICommitted {
  readonly viewName: unknown;
  readonly props: Record<string, unknown>;
  readonly instanceHandle: unknown;
  readonly children: readonly ICommitted[];
}

function asCommitted(value: unknown): ICommitted | undefined {
  if (!isRecord(value) || !isRecord(value.props)) return undefined;
  const children = Array.isArray(value.children) ? value.children : [];
  return {
    viewName: value.viewName,
    props: value.props,
    instanceHandle: value.instanceHandle,
    children: children.flatMap(child => asCommitted(child) ?? []),
  };
}

function flatten(nodes: readonly ICommitted[]): ICommitted[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

function committed(): ICommitted[] {
  return flatten(
    fabric.appRoot().children.flatMap(node => asCommitted(node) ?? []),
  );
}

function subjectByTestId(testId: string): ICommitted {
  const node = committed().find(candidate => candidate.props.testID === testId);
  if (node === undefined)
    throw new Error(`no committed node with testID=${testId}`);
  return node;
}

function terminationGate(
  handle: unknown,
): ((event: unknown) => unknown) | undefined {
  if (!isRecord(handle)) return undefined;
  const listeners = handle.listeners;
  if (!(listeners instanceof Map)) return undefined;
  const gate: unknown = listeners.get(TERMINATION_REQUEST);
  return typeof gate === 'function' ? gate : undefined;
}

let nextRoot = 9_960;

/** Compile a real `.svelte` source, mount it with the given props, settle. */
async function mountSource(
  source: string,
  props: Record<string, unknown> = {},
): Promise<number> {
  const root = (nextRoot += 1);
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename: 'PressableTag.svelte' }).js
      .code,
  );
  // Node caches a dynamic import by resolved path, so each arm needs a fresh query string or it
  // silently re-runs the previous arm's module (svelte-adapter-dom-shim §15).
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${root}`
  )) as {
    default: Component;
  };
  mount(root, Probe, props);
  await settle();
  return root;
}

afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

describe('Svelte: `pressable` as a tag', () => {
  // why: a tap is the entire product contract of Pressable — start+end without enough drift to
  // fall out of the retention region must fire exactly one onPress, never zero or more than one.
  it('synthesizes onPress on start + end', async () => {
    let presses = 0;
    const root = await mountSource(
      `<script>let { onPress } = $props();</script><pressable p={{ testID: 'subject', onPress }}></pressable>`,
      { onPress: () => (presses += 1) },
    );

    const handle = subjectByTestId('subject').instanceHandle;
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    expect(presses).toBe(1);

    unmount(root);
    await settle();
  });

  // why: RN's Pressable never fires ANY press callback while disabled, and folds `disabled` into
  // accessibilityState so assistive tech is told regardless of what the caller passed — ported
  // from RN's Pressable-test.js snapshot scenarios.
  it('suppresses onPress and folds accessibilityState.disabled when disabled', async () => {
    let presses = 0;
    const root = await mountSource(
      `<script>let { onPress } = $props();</script><pressable p={{ testID: 'subject', disabled: true, onPress }}></pressable>`,
      { onPress: () => (presses += 1) },
    );

    const subject = subjectByTestId('subject');
    expect(subject.props.accessibilityState).toMatchObject({ disabled: true });

    fabric.fireEvent(subject.instanceHandle, TOUCH_START);
    fabric.fireEvent(subject.instanceHandle, TOUCH_END);
    expect(presses).toBe(0);

    unmount(root);
    await settle();
  });

  // why: leaving `cancelable` unset must leave RN's own native default in charge — the oracle is
  // the ANSWER the gate resolves to, not whether a listener is present, since the behavior installs
  // one dispatcher per owned event at attach regardless
  // (`.claude/rules/adapter-parity-audit.md`, "phrase a parity oracle as a CAPABILITY").
  it('forces no termination answer when cancelable is unset (RN implicit yes)', async () => {
    const root = await mountSource(
      `<pressable p={{ testID: 'subject' }}></pressable>`,
    );

    const gate = terminationGate(subjectByTestId('subject').instanceHandle);
    expect(gate?.({ nativeEvent: {} })).toBeUndefined();

    unmount(root);
    await settle();
  });
});
