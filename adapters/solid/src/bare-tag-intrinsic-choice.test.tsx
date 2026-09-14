// A HAND-WRITTEN intrinsic tag, with no lowering transform in front of it — the shape an app writes
// once primitives are tags rather than components.
//
// Everything else about a bare tag was already covered: props, the `id` -> `nativeID` fold and the
// behavior folds by `lowering-equivalence.test.tsx` (its `lowered:` arms are literal tags), a
// spread by `spread-fold-parity.test.tsx`, listeners by
// `components/pressable-lowered-active-class.test.tsx`. What NOTHING covered is the one prop that
// picks a NATIVE VIEW rather than a value, and both directions of it were silently wrong:
//
//   <text-input-multiline />        the multiline view folded as SINGLE-line — `submitBehavior`
//                                   'blurAndSubmit', so Return blurs instead of inserting a newline
//   <text-input multiline />        the SINGLE-line view carrying the multiline fold
//
// Neither path that existed before could hit this: the wrapper consumes `multiline` to choose its
// intrinsic, and the transform resolves a literal at compile time. Device-only, nothing red.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { Component } from 'solid-js';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
// The TextInput behavior is what folds `submitBehavior`, and it is installed only here. Without it
// every payload below is bare and the assertions fail as if the engine were broken.
import './register';
import { mount, unmount } from './render';

const require_ = createRequire(import.meta.url);
const { HOST_PRIMITIVES } = require_(
  '@symbiote-native/components/host-primitives',
);

const fabric = installFabric();
let nextRoot = 9_400;

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

function walk(node: IFakeNode, out: IFakeNode[]): IFakeNode[] {
  out.push(node);
  for (const child of node.children) walk(child, out);
  return out;
}

async function committed(tree: Component): Promise<IFakeNode> {
  const root = (nextRoot += 1);
  fabric.reset();
  mount(root, tree);
  await flush();
  const last = fabric.committed[fabric.committed.length - 1];
  const hit = (last === undefined ? [] : walk(last, [])).find(
    node => node.props.testID === 'probe',
  );
  unmount(root);
  if (hit === undefined) throw new Error('nothing committed with testID=probe');
  return hit;
}

describe('the tag decides the text-input view, on a hand-written tag', () => {
  // The renderer keys its seed on two literal tag names and the selector prop. Re-derived here so
  // the shortcut cannot outlive the spec that licenses it — same guard shape as
  // `renderer-alias-fold.test.ts`.
  it('the spec still spells the pair the renderer hardcodes', () => {
    expect(HOST_PRIMITIVES.TextInput.intrinsic).toBe('text-input');
    expect(HOST_PRIMITIVES.TextInput.intrinsicWhen).toEqual({
      prop: 'multiline',
      intrinsic: 'text-input-multiline',
    });
  });

  it('folds the multiline tag as multiline, with no prop written', async () => {
    const node = await committed(() => <text-input-multiline testID="probe" />);

    expect(node.viewName).toBe('RCTMultilineTextInputView');
    // The fold the seed exists for: single-line resolves this to 'blurAndSubmit'.
    expect(node.props.submitBehavior).toBe('newline');
  });

  it('folds the single-line tag as single-line', async () => {
    const node = await committed(() => <text-input testID="probe" />);

    expect(node.viewName).toBe('RCTSinglelineTextInputView');
    expect(node.props.submitBehavior).toBe('blurAndSubmit');
    // Not seeded on this tag: the wrapper's payload carries no `multiline` key either, and adding
    // one here would be a divergence in the opposite direction.
    expect(Object.keys(node.props)).not.toContain('multiline');
  });

  it('refuses a multiline prop on the single-line tag', async () => {
    await expect(
      committed(() => <text-input testID="probe" multiline />),
    ).rejects.toThrow(/contradicts the tag/);
  });

  it('refuses multiline={false} on the multiline tag', async () => {
    await expect(
      committed(() => (
        <text-input-multiline testID="probe" multiline={false} />
      )),
    ).rejects.toThrow(/contradicts the tag/);
  });

  it('accepts a redundant multiline prop on the multiline tag', async () => {
    const node = await committed(() => (
      <text-input-multiline testID="probe" multiline />
    ));

    expect(node.viewName).toBe('RCTMultilineTextInputView');
    expect(node.props.submitBehavior).toBe('newline');
  });

  // The spread is the shape a transform must REFUSE (`unreadableAttributeSet`) because it cannot
  // read the bag at compile time. Hand-written there is no transform, so the guard is the only
  // thing standing between a bag and the wrong native view.
  it('catches the contradiction through a spread', async () => {
    const bag = { testID: 'probe', multiline: true };

    await expect(committed(() => <text-input {...bag} />)).rejects.toThrow(
      /contradicts the tag/,
    );
  });
});
