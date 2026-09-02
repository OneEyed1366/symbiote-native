// The TextInput ref must hand the app the SAME composition core defines — no more, no fewer.
//
// The defect this guards is two-sided and was measured on 2026-08-31: the wrapper's handle used to
// be five methods and thereby CLOSED OVER the node, so the component path lost
// `measure`/`measureInWindow`/`measureLayout`/`setNativeProps`, while a lowered element handed back
// the bare node and lost `clear`/`isFocused`/`setSelection`. Not "lowering narrows the surface" but
// TWO surfaces, crossed by writing `multiline={isLong}` instead of `multiline`.
//
// The composition is READ OUT OF CORE (`buildTextInputHandle`), never listed here. A test that
// spells the nine names passes while core says something else, and it is the drift — not the count
// — that this exists to catch.
import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { buildTextInputHandle } from '@symbiote-native/components';
import { createElement } from '@symbiote-native/engine';
import { mount, unmount } from './render';
import { TextInput } from './components/text-input';
import type { ITextInputHandle } from '@symbiote-native/components';

installFabric();

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

/** The reference composition, from core. */
function coreMethodNames(): string[] {
  const node = createElement('RCTSinglelineTextInputView');
  return Object.keys(buildTextInputHandle(node)).sort();
}

function methodNamesOf(handle: object): string[] {
  return Object.keys(handle)
    .filter(
      key => typeof (handle as Record<string, unknown>)[key] === 'function',
    )
    .sort();
}

describe('the TextInput ref composition', () => {
  it('the component path hands back exactly what core builds', async () => {
    let captured: ITextInputHandle | undefined;
    mount(9100, () => (
      <TextInput
        testID="handle-parity"
        ref={(handle: ITextInputHandle) => {
          captured = handle;
        }}
      />
    ));
    await flush();

    expect(captured, 'no handle reached the ref').toBeDefined();
    expect(methodNamesOf(captured as object)).toEqual(coreMethodNames());
    unmount(9100);
  });

  // Break-test for the oracle: `coreMethodNames` must be able to return a NON-trivial set, or the
  // comparison above would pass against an empty handle.
  it('reads a non-trivial composition out of core', () => {
    const names = coreMethodNames();
    expect(names.length).toBeGreaterThan(5);
    // Both halves of the union must be present — the two directions the surfaces used to lose.
    expect(names).toContain('clear');
    expect(names).toContain('measure');
  });
});
