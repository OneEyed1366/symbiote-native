// `image` as a TAG, measured through Vue's own renderer. Coverage scope: renderImage's own
// transform (source/src/srcSet resolution, the width/height style fold, resizeMode/tintColor-
// from-style, the alt fold) is pure, framework-agnostic and already exhaustively covered by
// core/components/src/view/render-image/render-image.test.ts — re-asserting those branches
// through a Vue mount would duplicate that suite, not add proof. This file covers what is
// genuinely VUE-side: that a bare `image` tag reaches the engine behavior carrying that
// transform, that the installed source resolver runs through the Vue entry point, that a native
// topLoad event reaches an `onLoad` prop, and that a Vue `class` resolves through the shared
// style registry — the same bridge-smoke shape React's and Solid's Image suites already carry
// (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: every Image prop is optional and every path resolves to some descriptor —
// nothing here rejects an input (React's and Solid's twins reach the same conclusion).
import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearGlobalStyles,
  registerRules,
  type ISymbioteEvent,
} from '@symbiote-native/engine';
import { setImageSourceResolver } from '@symbiote-native/components';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the fold is what the tag's behavior carries. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 9_977;
const IMAGE_VIEW = 'RCTImageView';
const fabric = installFabric();
const ASSET_ID = 42;
const RESOLVED_ASSET = { uri: 'asset://42', scale: 1, width: 10, height: 10 };

const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

function imageNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === IMAGE_VIEW);
  if (node === undefined) throw new Error(`no ${IMAGE_VIEW} was created`);
  return node;
}

function mountTag(props: Record<string, unknown>): Promise<void> {
  mount(ROOT_TAG, defineComponent({ setup: () => () => h('image', props) }));
  return settle();
}

beforeEach(() => {
  fabric.reset();
  setImageSourceResolver(source =>
    source === ASSET_ID ? RESOLVED_ASSET : source,
  );
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
  setImageSourceResolver(source => source);
});

describe('Vue: `image` as a tag', () => {
  it('mounts to a real RCTImageView, proving the tag reaches the fold', async () => {
    await mountTag({ source: { uri: 'http://x/y.png' } });
    expect(fabric.appRoot().children.map(n => n.viewName)).toContain(
      IMAGE_VIEW,
    );
  });

  it('runs the installed source resolver on a require()-style number before it reaches native', async () => {
    await mountTag({ source: ASSET_ID });
    const source = imageNode().props.source;
    expect(Array.isArray(source) ? source[0] : undefined).toEqual(
      RESOLVED_ASSET,
    );
  });

  it('fires onLoad from the captured native topLoad event', async () => {
    let loadedWith: ISymbioteEvent | undefined;
    await mountTag({
      source: { uri: 'http://x/y.png' },
      onLoad: (event: ISymbioteEvent) => {
        loadedWith = event;
      },
    });

    fabric.fireEvent(imageNode().instanceHandle, 'topLoad', {
      source: { uri: 'http://x/y.png', width: 1, height: 1 },
    });
    expect(loadedWith).toBeDefined();
  });

  it('resolves a Vue `class` through the shared style registry onto the image', async () => {
    registerRules([
      {
        tokens: ['hero'],
        specificity: [0, 1, 0],
        order: 0,
        style: { opacity: 0.75 },
      },
    ]);
    await mountTag({ source: { uri: 'http://x/y.png' }, class: 'hero' });
    expect(imageNode().props.opacity).toBe(0.75);
  });
});
