// Regression guard: imageStyle previously accepted ONLY a JS style object/array (isStyleProp
// rejects a bare string). It now also resolves a class-name string through the shared style
// registry, same as the `class` prop fix on the WRAPPER view (see image-background.ts) — and must
// land on the INNER image, never the wrapper, exactly like that prior fix.
//
// Unit under test: the `imageStyle` ternary in adapters/vue/src/components/image-background.ts
// (string -> resolveClassName | isStyleProp -> passthrough | else -> undefined), and that
// renderImageBackground (shared @symbiote-native/components logic, not re-asserted here) keeps
// routing it onto the inner image descriptor rather than the wrapper.
//
// No Negative group: imageStyle has no throwing path — an unresolvable value silently degrades to
// `undefined`, it never rejects.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, ImageBackground } from '@symbiote-native/vue';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 514;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function committedImage(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTImageView');
  expect(node, 'the inner image was committed').toBeDefined();
  if (node === undefined) throw new Error('unreachable: image missing');
  return node;
}

function committedWrapper(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTView');
  expect(node, 'the wrapper view was committed').toBeDefined();
  if (node === undefined) throw new Error('unreachable: wrapper missing');
  return node;
}

function mountImageBackground(imageStyle: unknown): Promise<void> {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () => h(ImageBackground, { source: { uri: 'x' }, imageStyle }),
    }),
  );
  return tick();
}

describe('Vue ImageBackground imageStyle class-name support', () => {
  describe('Positive (every accepted shape resolves onto the inner image without error)', () => {
    it('resolves a class-name string onto the inner image, not the wrapper', async () => {
      // why: the class-name path is the regression this file guards, and it must land on the
      // SAME node the `class` prop fix (image-background.ts) targets — the inner image, never
      // the absolute-fill wrapper View.
      registerStyles({ tinted: { opacity: 0.5 } });
      await mountImageBackground('tinted');

      expect(committedImage().props.opacity).toBe(0.5);
      expect(committedWrapper().props.opacity).toBeUndefined();
    });

    it('still accepts an ordinary style object unchanged', async () => {
      // why: the class-name branch is additive to the pre-existing object/array contract, not a
      // replacement for it.
      await mountImageBackground({ opacity: 0.25 });

      expect(committedImage().props.opacity).toBe(0.25);
    });

    it('drops an unresolvable imageStyle rather than throwing', async () => {
      // why: the ternary's else-branch (not a string, not isStyleProp) must degrade to
      // `undefined` — a malformed prop must never crash the image render.
      await mountImageBackground(42);

      expect(committedImage().props.opacity).toBeUndefined();
    });
  });
});
