// What a Solid tag hands the engine for `role` / `aria-*` — the FORWARDING, as of 2026-09-18.
//
// This file used to assert the FOLD: that `aria-label` arrived as `accessibilityLabel` with the raw
// key gone. That rule is the device's now (`foldAriaProps`, `SymbioteFabricProps.cpp`) and the
// headless payload builder holds no copy of it, so asserting the folded names here would assert a
// harness rather than a device. The rule's own eleven cases are in
// `core/engine/cpp/tests/js/aria-payload.itest.ts`, read off a real committed payload.
//
// What is left is genuinely this adapter's and is not a smaller version of the old claim: the engine
// can only fold what reaches it under the name it expects. A hyphenated attribute is exactly what a
// compiler can lose in silence.
//
// Still read on the COMMITTED payload rather than node.props, because that is what the engine is
// handed. Shape borrowed from
// `core/engine/src/__tests__/aria-fold.test.ts`, which proves the fold itself; this proves Solid
// reaches it.
//
// This file used to carry TWO arms, a component and a tag, and both were spelled `<view>` — the
// comparison measured nothing (`test-harness-false-greens.md` §12) and the absolute expectations
// were always the whole oracle. Only the duplicate went.
import { describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const TARGET = 'aria-parity';
let nextRoot = 8300;

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

// Reset per case: every case opens its OWN surface, and `appRoot()` searches the creation log, so
// without this it answers with the FIRST case's root for the rest of the file.
async function committed(
  render: () => unknown,
): Promise<Record<string, unknown>> {
  fabric.reset();
  const root = (nextRoot += 1);
  mount(root, render as never);
  await flush();
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === TARGET,
  );
  if (hit === undefined) throw new Error('nothing committed');
  const payload = { ...hit.payload };
  unmount(root);
  return payload;
}

describe('what a Solid tag hands the engine for aria', () => {
  // why: a HYPHENATED attribute is the thing a compiler can lose, and losing it is silent — the
  // engine's rule reads `aria-label` by that exact spelling, so a renderer that camel-cased it,
  // lowercased it or dropped it would produce a node with no accessibility and nothing red. Svelte's
  // compiler really does lowercase static attribute names (`canonical-prop-names.ts`), which is why
  // this is asserted per adapter rather than once.
  it('forwards role and a hyphenated aria key under their authored names', async () => {
    const props = await committed(() => (
      <view testID={TARGET} role="button" aria-label="x" />
    ));

    expect(props.role).toBe('button');
    expect(props['aria-label']).toBe('x');
  });

  // why: an alias and its explicit twin must BOTH arrive, because the precedence between them is
  // the engine's to decide and it cannot decide from a bag missing one of them. A renderer that
  // helpfully dropped the loser here would make the rule unable to run.
  it('forwards an alias and its explicit twin together', async () => {
    const props = await committed(() => (
      <view testID={TARGET} accessibilityLabel="explicit" aria-label="alias" />
    ));

    expect(props.accessibilityLabel).toBe('explicit');
    expect(props['aria-label']).toBe('alias');
  });

  // why: a COMPOSITE has to survive as an object. Solid writes props one key at a time through a
  // fine-grained effect, so an object-valued prop is the shape most likely to be flattened or
  // re-created per field on the way through.
  it('forwards a composite alongside its alias, as an object', async () => {
    const props = await committed(() => (
      <view
        testID={TARGET}
        accessibilityState={{ checked: false, busy: true }}
        aria-checked={true}
      />
    ));

    expect(props.accessibilityState).toEqual({ checked: false, busy: true });
    expect(props['aria-checked']).toBe(true);
  });
});
