// The one prop that picks a NATIVE VIEW rather than a value, and both directions of it were
// silently wrong:
//
//   <text-input-multiline />        the multiline view folded as SINGLE-line — `submitBehavior`
//                                   'blurAndSubmit', so Return blurs instead of inserting a newline
//   <text-input multiline />        the SINGLE-line view carrying the multiline fold
//
// The wrapper that used to stand here consumed `multiline` to choose its intrinsic, so it could not
// reach either case. Device-only, nothing red. Everything else about a tag is covered by its
// neighbours: props and the `id` -> `nativeID` fold by `tag-folds.test.tsx`, a spread by
// `spread-fold.test.tsx`, listeners by `components/pressable-active-class.test.tsx`.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { Component } from 'solid-js';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
// The TextInput behavior is what folds `submitBehavior`, and it is installed only here. Without it
// every payload below is bare and the assertions fail as if the engine were broken.
import './register';
import { mount, unmount } from './render';

const require_ = createRequire(import.meta.url);
const { HOST_PRIMITIVES } = require_(
  '@symbiote-native/components/host-primitives',
);

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRoot = 9_400;

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

async function committed(tree: Component): Promise<ILiveNode> {
  const root = (nextRoot += 1);
  fabric.reset();
  mount(root, tree);
  await flush();
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === 'probe',
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
    expect(node.payload.submitBehavior).toBe('newline');
  });

  it('folds the single-line tag as single-line', async () => {
    const node = await committed(() => <text-input testID="probe" />);

    expect(node.viewName).toBe('RCTSinglelineTextInputView');
    expect(node.payload.submitBehavior).toBe('blurAndSubmit');
    // Not seeded on this tag: the wrapper's payload carries no `multiline` key either, and adding
    // one here would be a divergence in the opposite direction.
    expect(Object.keys(node.payload)).not.toContain('multiline');
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
    expect(node.payload.submitBehavior).toBe('newline');
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
