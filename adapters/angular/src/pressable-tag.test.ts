// `pressable` as a TAG, measured through Angular's own renderer. The press machine itself
// (createPressHandlers/createPressRuntime — the long-press timer, unstable_pressDelay, retention
// drift, suppression flags) lives on the engine node (`core/components/src/behaviors/pressable.ts`)
// and is fully unit-tested there; this file proves the ANGULAR WIRING: a template reaches the tag,
// the responder listeners land on the real host node, and app callbacks/a11y folding survive
// Angular's own change detection — the same bridge-smoke shape React's and Solid's Pressable
// suites already carry (`.docs/test-cases/rn-parity.test-cases.md`).
//
// The fixture imports `SYMBIOTE_ELEMENTS` and declares no schema, which is the shape an app writes.
// This file runs JIT, so it answers what the renderer DOES, not what the compiler accepts
// (`.claude/rules/test-harness-false-greens.md` §21).
//
// No Negative group: nothing here throws. `disabled` suppresses a press silently (a Positive
// contract — completes without error, the callback just never fires), it never rejects.
import '@angular/compiler';
import { Component, type Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what builds the press machine. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { SYMBIOTE_ELEMENTS } from './elements';
import { mount, unmount } from './render';

const ROOT_TAG = 9_965;
const MAX_SETTLE_TICKS = 20;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const TERMINATION_REQUEST = 'responderTerminationRequest';
const fabric = installFabric();

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Sampled rather than a fixed count, mirroring `button-tag.test.ts`: a half-built tree is
// indistinguishable from a subtree the behavior never built.
async function flushUntilSettled(): Promise<void> {
  let previous = -1;
  for (let index = 0; index < MAX_SETTLE_TICKS; index += 1) {
    await tick();
    const current = fabric.counts.completeRoot;
    if (current === previous && current > 0) return;
    previous = current;
  }
  throw new Error('the tree never settled');
}

function flatten(nodes: readonly IFakeNode[]): IFakeNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

function subjectByTestId(testId: string): IFakeNode {
  const node = flatten(fabric.appRoot().children).find(
    candidate => candidate.props.testID === testId,
  );
  if (node === undefined)
    throw new Error(`no committed node with testID=${testId}`);
  return node;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

let fixtureId = 0;

async function mountTemplate(
  template: string,
  bindings: Record<string, unknown> = {},
): Promise<void> {
  fixtureId += 1;
  @Component({
    // Unique per mount: a repeated selector makes Angular log an NG0912 component-id collision.
    selector: `pressable-tag-fixture-${fixtureId}`,
    standalone: true,
    imports: [SYMBIOTE_ELEMENTS],
    template,
  })
  class Fixture {
    [key: string]: unknown;
    constructor() {
      Object.assign(this, bindings);
    }
  }

  mount(ROOT_TAG, Fixture satisfies Type<unknown>);
  await flushUntilSettled();
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Angular: `pressable` as a tag', () => {
  // why: a tap is the entire product contract of Pressable — start+end without enough drift to
  // fall out of the retention region must fire exactly one onPress, never zero or more than one.
  it('synthesizes onPress on start + end', async () => {
    let presses = 0;
    await mountTemplate(
      `<pressable testID="subject" [onPress]="onPress"></pressable>`,
      {
        onPress: () => (presses += 1),
      },
    );

    const handle = subjectByTestId('subject').instanceHandle;
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    expect(presses).toBe(1);
  });

  // why: RN's Pressable never fires ANY press callback while disabled, and folds `disabled` into
  // accessibilityState so assistive tech is told regardless of what the caller passed — ported
  // from RN's Pressable-test.js snapshot scenarios. `[disabled]` rather than `disabled` — an
  // attribute is the STRING "true" and the fold reads a boolean.
  it('suppresses onPress and folds accessibilityState.disabled when disabled', async () => {
    let presses = 0;
    await mountTemplate(
      `<pressable testID="subject" [disabled]="true" [onPress]="onPress"></pressable>`,
      { onPress: () => (presses += 1) },
    );

    const subject = subjectByTestId('subject');
    expect(subject.props.accessibilityState).toMatchObject({ disabled: true });

    fabric.fireEvent(subject.instanceHandle, TOUCH_START);
    fabric.fireEvent(subject.instanceHandle, TOUCH_END);
    expect(presses).toBe(0);
  });

  // why: leaving `cancelable` unset must leave RN's own native default in charge — the oracle is
  // the ANSWER the gate resolves to, not whether a listener is present, since the behavior installs
  // one dispatcher per owned event at attach regardless
  // (`.claude/rules/adapter-parity-audit.md`, "phrase a parity oracle as a CAPABILITY").
  it('forces no termination answer when cancelable is unset (RN implicit yes)', async () => {
    await mountTemplate(`<pressable testID="subject"></pressable>`);

    const gate = terminationGate(subjectByTestId('subject').instanceHandle);
    expect(gate?.({ nativeEvent: {} })).toBeUndefined();
  });
});
