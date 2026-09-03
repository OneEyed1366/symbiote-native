// Does a LOWERED TextInput still hand the app its text?
//
// THE DEVICE BUG, 2026-08-31, examples/solid's canary: typing into the field worked — native owns
// its own text and echoes keystrokes without asking JS — while `Hello, stranger` never became
// `Hello, <name>`. `onValueChange` is not a Fabric event but a fold the COMPONENT used to do over
// the raw `change` payload, so on a lowered element it reached `node.props` as a function key,
// `fabricProps` dropped it, and nothing called it. Nothing red anywhere: the tree was right, the
// listener list was right, and the only wrong thing was that a derivation had no home.
//
// Asserted as PARITY between the two paths rather than against a written-down expectation, which
// would only restate whichever path was read last. That is also the general contract a lowering
// transform owes: it is an optimisation, and an optimisation that moves the observable surface —
// in either direction — is a bug (`.claude/rules/adapter-parity-audit.md`).
import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
// THE SIDE-EFFECT IMPORT IS LOAD-BEARING, and its absence reads as the defect under test.
// The behavior registry is keyed by intrinsic tag and populated only by './register', which the
// package barrel pulls in but a test importing './render' directly does not. Without it a lowered
// element commits with NO listeners at all, the change event lands nowhere, and every assertion
// below fails as if the engine fold were missing. Measured: it cost one wrong diagnosis today.
import './register';
import { mount, unmount } from './render';
import { TextInput } from './components/text-input';

const ROOT_TAG = 9314;
const SINGLELINE_VIEW = 'RCTSinglelineTextInputView';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// The creation-time record: its instanceHandle is what the slot dispatches events at, exactly as
// the native side would.
function createdInput(): IFakeNode {
  const node = fabric.find(n => n.viewName === SINGLELINE_VIEW);
  if (node === undefined) throw new Error('no singleline input was created');
  return node;
}

function type(text: string, eventCount: number): void {
  fabric.fireEvent(createdInput().instanceHandle, 'topChange', {
    text,
    eventCount,
  });
}

describe('lowered vs component TextInput: onValueChange', () => {
  it('the LOWERED intrinsic calls onValueChange with the typed text', async () => {
    const seen = vi.fn();
    mount(ROOT_TAG, () => (
      <symbiote-text-input value="" onValueChange={seen} />
    ));
    await tick();

    type('ab', 1);

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0]).toBe('ab');
  });

  // The control. Without it a green row above cannot tell "the lowered path works" from "this
  // harness cannot see the callback at all" — the shape `.claude/rules/test-harness-false-greens.md`
  // exists for.
  it('the COMPONENT calls it identically', async () => {
    const seen = vi.fn();
    mount(ROOT_TAG, () => <TextInput value="" onValueChange={seen} />);
    await tick();

    type('ab', 1);

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0]).toBe('ab');
  });

  // The canary's own shape, end to end: the callback drives a signal and a sibling reads it. This
  // is what was dead on device, and it fails on a callback that fires with the wrong argument just
  // as loudly as on one that never fires.
  it('a lowered input drives a derived signal, as the canary does', async () => {
    const [name, setName] = createSignal('');
    mount(ROOT_TAG, () => (
      <symbiote-text-input value={name()} onValueChange={setName} />
    ));
    await tick();

    type('world', 1);
    await tick();

    expect(name()).toBe('world');
  });
});
