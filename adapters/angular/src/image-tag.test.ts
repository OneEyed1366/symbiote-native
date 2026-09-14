// `image` as a TAG, measured through Angular's own renderer. Coverage scope: renderImage's own
// transform (source/src/srcSet resolution, the width/height style fold, resizeMode/tintColor-
// from-style, the alt fold) is pure, framework-agnostic and already exhaustively covered by
// core/components/src/view/render-image/render-image.test.ts — re-asserting those branches
// through an Angular mount would duplicate that suite, not add proof. This file covers what is
// genuinely ANGULAR-side: that a bare `image` tag reaches the engine behavior carrying that
// transform, that the installed source resolver runs through the Angular entry point, that a
// native topLoad event reaches an `(onLoad)` binding, and that an Angular `[class]` resolves
// through the shared style registry — the same bridge-smoke shape React's and Solid's Image
// suites already carry (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: every Image prop is optional and every path resolves to some descriptor —
// nothing here rejects an input (React's and Solid's twins reach the same conclusion).
//
// The fixture imports `SYMBIOTE_ELEMENTS` and declares no schema, which is the shape an app
// writes. This file runs JIT, so it answers what the renderer DOES, not what the compiler
// accepts (`.claude/rules/test-harness-false-greens.md` §21).
import '@angular/compiler';
import { Component, type Type } from '@angular/core';
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
import { SYMBIOTE_ELEMENTS } from './elements';
import { mount, unmount } from './render';

const ROOT_TAG = 9_978;
const MAX_SETTLE_TICKS = 20;
const IMAGE_VIEW = 'RCTImageView';
const fabric = installFabric();
const ASSET_ID = 42;
const RESOLVED_ASSET = { uri: 'asset://42', scale: 1, width: 10, height: 10 };

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Sampled rather than a fixed count, mirroring `activity-indicator-tag.test.ts`: a half-built
// tree is indistinguishable from a subtree the behavior never built.
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

function imageNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === IMAGE_VIEW);
  if (node === undefined) throw new Error(`no ${IMAGE_VIEW} was created`);
  return node;
}

let fixtureId = 0;

async function mountTemplate(
  template: string,
  bindings: Record<string, unknown> = {},
): Promise<void> {
  fixtureId += 1;
  @Component({
    // Unique per mount: a repeated selector makes Angular log an NG0912 component-id collision.
    selector: `image-tag-fixture-${fixtureId}`,
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

describe('Angular: `image` as a tag', () => {
  it('mounts to a real RCTImageView, proving the tag reaches the fold', async () => {
    await mountTemplate(`<image [source]="{ uri: 'http://x/y.png' }"></image>`);
    expect(fabric.appRoot().children.map(n => n.viewName)).toContain(
      IMAGE_VIEW,
    );
  });

  it('runs the installed source resolver on a require()-style number before it reaches native', async () => {
    await mountTemplate(`<image [source]="42"></image>`);
    const source = imageNode().props.source;
    expect(Array.isArray(source) ? source[0] : undefined).toEqual(
      RESOLVED_ASSET,
    );
  });

  it('fires onLoad from the captured native topLoad event', async () => {
    let loadedWith: ISymbioteEvent | undefined;
    await mountTemplate(
      `<image [source]="{ uri: 'http://x/y.png' }" [onLoad]="onLoad"></image>`,
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
  });

  it('resolves an Angular `[class]` through the shared style registry onto the image', async () => {
    registerRules([
      {
        tokens: ['hero'],
        specificity: [0, 1, 0],
        order: 0,
        style: { opacity: 0.75 },
      },
    ]);
    await mountTemplate(
      `<image [source]="{ uri: 'http://x/y.png' }" class="hero"></image>`,
    );
    expect(imageNode().props.opacity).toBe(0.75);
  });
});
