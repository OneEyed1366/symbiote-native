// `image` as a TAG, through the REAL Svelte compiler. Coverage scope: renderImage's own
// transform (source/src/srcSet resolution, the width/height style fold, resizeMode/tintColor-
// from-style, the alt fold) is pure, framework-agnostic and already exhaustively covered by
// core/components/src/view/render-image/render-image.test.ts — re-asserting those branches
// through a Svelte mount would duplicate that suite, not add proof. This file covers what is
// genuinely SVELTE-side: that a bare `image` tag reaches the engine behavior carrying that
// transform, that the installed source resolver runs through the Svelte entry point, that a
// native topLoad event reaches an `onLoad` prop, and that a Svelte `class` resolves through the
// shared style registry — the same bridge-smoke shape React's and Solid's Image suites already
// carry (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: every Image prop is optional and every path resolves to some descriptor —
// nothing here rejects an input (React's and Solid's twins reach the same conclusion).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
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

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const IMAGE_VIEW = 'RCTImageView';
const fabric = installFabric();
const ASSET_ID = 42;
const RESOLVED_ASSET = { uri: 'asset://42', scale: 1, width: 10, height: 10 };

// Named for this suite alone — two suites sharing a compiled artifact race under a full run
// (`.claude/rules/smoke-compiled-artifact-collisions.md`).
const PROBE_OUT = join(__dirname, '.smoke-compiled-image-tag.mjs');

// Copied from `metro-svelte-transformer.cjs`. A measurement taken on a compiler's STOCK
// configuration is a fact about somebody else's build.
const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

function imageNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === IMAGE_VIEW);
  if (node === undefined) throw new Error(`no ${IMAGE_VIEW} was created`);
  return node;
}

let nextRoot = 9_960;

/** Compile a real `.svelte` source, mount it, settle. */
async function mountSource(
  source: string,
  props: Record<string, unknown> = {},
): Promise<number> {
  const root = (nextRoot += 1);
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename: 'ImageTag.svelte' }).js
      .code,
  );
  // Node caches a dynamic import by resolved path, so each arm needs a fresh query string or it
  // silently re-runs the previous arm's module (svelte-adapter-dom-shim §15).
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${root}`
  )) as { default: Component };
  mount(root, Probe, props);
  await settle();
  return root;
}

beforeEach(() => {
  fabric.reset();
  setImageSourceResolver(source =>
    source === ASSET_ID ? RESOLVED_ASSET : source,
  );
});

afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

describe('Svelte: `image` as a tag', () => {
  it('mounts to a real RCTImageView, proving the tag reaches the fold', async () => {
    const root = await mountSource(
      `<image source={{ uri: 'http://x/y.png' }}></image>`,
    );

    expect(imageNode().viewName).toBe(IMAGE_VIEW);

    unmount(root);
    await settle();
    clearGlobalStyles();
  });

  it('runs the installed source resolver on a require()-style number before it reaches native', async () => {
    const root = await mountSource(`<image source={42}></image>`);

    const source = imageNode().props.source;
    expect(Array.isArray(source) ? source[0] : undefined).toEqual(
      RESOLVED_ASSET,
    );

    unmount(root);
    await settle();
    clearGlobalStyles();
  });

  it('fires onLoad from the captured native topLoad event', async () => {
    let loadedWith: ISymbioteEvent | undefined;
    const root = await mountSource(
      `<script>let { onLoad } = $props();</script>` +
        `<image source={{ uri: 'http://x/y.png' }} onLoad={onLoad}></image>`,
      {
        onLoad: (event: ISymbioteEvent) => {
          loadedWith = event;
        },
      },
    );

    fabric.fireEvent(imageNode().instanceHandle, 'topLoad', {
      source: { uri: 'http://x/y.png', width: 1, height: 1 },
    });
    expect(loadedWith).toBeDefined();

    unmount(root);
    await settle();
    clearGlobalStyles();
  });

  it('resolves a Svelte `class` through the shared style registry onto the image', async () => {
    registerRules([
      {
        tokens: ['hero'],
        specificity: [0, 1, 0],
        order: 0,
        style: { opacity: 0.75 },
      },
    ]);
    const root = await mountSource(
      `<image source={{ uri: 'http://x/y.png' }} class="hero"></image>`,
    );

    expect(imageNode().props.opacity).toBe(0.75);

    unmount(root);
    await settle();
    clearGlobalStyles();
  });
});
