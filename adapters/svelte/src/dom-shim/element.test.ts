// Covers the devtools owner tag (ISymbioteNodeOwner — symbiote-devtools-inspector skill):
// createEngineNode() reads `__svelte_meta`, the property Svelte's own compiled output stamps
// via the publicly re-exported `$.add_locations` (dev-mode compiles only — see
// metro-svelte-transformer.cjs). Stamped here manually rather than through a compiled component,
// mirroring offscreen-fragment.test.ts's "drive the shim API directly" approach: the contract
// under test is "createEngineNode reads this property correctly", not Svelte's own compiler
// behavior, which the transformer's own tests already cover.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  createSurface,
  disposeRoot,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import { patchGlobals, restoreGlobals } from './patch-globals';
import { ShimElement } from './element';
import { createRootShimElement } from '../root-element';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_305;

const fabric = installFabric();

let surface: SymbioteSurface | undefined;

beforeEach(() => {
  fabric.reset();
  patchGlobals();
  surface = createSurface(ROOT_TAG);
});

afterEach(() => {
  disposeRoot(ROOT_TAG);
  surface = undefined;
  restoreGlobals();
});

function liveRoot(): ShimElement {
  if (surface === undefined) throw new Error('surface not created');
  return createRootShimElement(surface);
}

describe('ShimElement owner tag from __svelte_meta', () => {
  it('tags the engine node with a single-entry chain when the leaf component has no caller', () => {
    const root = liveRoot();
    const button = new ShimElement('symbiote-view');
    Object.assign(button, {
      __svelte_meta: { loc: { file: 'Button.svelte', line: 3, column: 1 } },
    });

    root.appendChild(button);

    expect(button.engineNode?.owner).toEqual({
      chain: [{ component: 'Button', file: 'Button.svelte' }],
    });
  });

  it('leaves owner undefined when the compiler never ran in dev mode', () => {
    const root = liveRoot();
    const plain = new ShimElement('symbiote-view');

    root.appendChild(plain);

    expect(plain.engineNode?.owner).toBeUndefined();
  });

  it('walks __svelte_meta.parent into a root-first ancestry chain', () => {
    // why: __svelte_meta.loc only names the LEAF creator (View.svelte) — .parent is Svelte's own
    // dev_stack, pushed one entry per <Component/> invocation, and is what lets a composing-only
    // component (CanaryScreen, which never creates a native node directly) show up at all. See
    // element.ts's resolveOwnerFromSvelteMeta comment for the verified compiler shape.
    const root = liveRoot();
    const text = new ShimElement('symbiote-text');
    Object.assign(text, {
      __svelte_meta: {
        loc: { file: 'View.svelte', line: 2, column: 0 },
        parent: {
          file: 'CanaryScreen.svelte',
          componentTag: 'View',
          parent: {
            file: 'App.svelte',
            componentTag: 'CanaryScreen',
            parent: null,
          },
        },
      },
    });

    root.appendChild(text);

    expect(text.engineNode?.owner).toEqual({
      chain: [
        { component: 'App', file: 'App.svelte' },
        { component: 'CanaryScreen', file: 'CanaryScreen.svelte' },
        { component: 'View', file: 'View.svelte' },
      ],
    });
  });

  it('drops node_modules entries from the chain without breaking the surrounding levels', () => {
    // why: a library wrapper (@symbiote-native/svelte's own View.svelte) creates a dev_stack
    // entry exactly like an app component — filtering it out is what makes the panel show
    // "App > CanaryScreen" instead of "App > CanaryScreen > View" for library-authored View.
    const root = liveRoot();
    const text = new ShimElement('symbiote-text');
    Object.assign(text, {
      __svelte_meta: {
        loc: {
          file: '/repo/node_modules/@symbiote-native/svelte/build/components/View.svelte',
          line: 1,
          column: 0,
        },
        parent: {
          file: '/repo/examples/svelte/screens/CanaryScreen.svelte',
          componentTag: 'View',
          parent: null,
        },
      },
    });

    root.appendChild(text);

    expect(text.engineNode?.owner).toEqual({
      chain: [
        {
          component: 'CanaryScreen',
          file: '/repo/examples/svelte/screens/CanaryScreen.svelte',
        },
      ],
    });
  });

  it('collapses consecutive duplicate files from block-type dev_stack entries', () => {
    // why: an {#each}/{#if} block pushes its OWN dev_stack entry (type !== 'component') carrying
    // the SAME enclosing file as the component around it — real compiler output confirmed this
    // (Grand.svelte's {#each} wrapping a <Mid/> invocation). Left undeduped it would show
    // "Grand > Grand > Mid" instead of "Grand > Mid".
    const root = liveRoot();
    const text = new ShimElement('symbiote-text');
    Object.assign(text, {
      __svelte_meta: {
        loc: { file: 'Mid.svelte', line: 1, column: 0 },
        parent: {
          file: 'Grand.svelte',
          componentTag: 'Mid',
          parent: { file: 'Grand.svelte', parent: null }, // the {#each} block's own entry
        },
      },
    });

    root.appendChild(text);

    expect(text.engineNode?.owner).toEqual({
      chain: [
        { component: 'Grand', file: 'Grand.svelte' },
        { component: 'Mid', file: 'Mid.svelte' },
      ],
    });
  });

  it('collapses same-file entries left NON-adjacent by a library entry sitting between them', () => {
    // why: real-device bug, confirmed on `examples/svelte` — a nested-navigators demo screen
    // reused ONE app component (MenuScreen) at every navigator nesting level, with a library
    // navigator-internal file between each pair. Deduping BEFORE the library filter (the
    // original code) never saw these as adjacent, so filtering the library entries out afterward
    // left them uncollapsed: the panel showed `App > MenuScreen > MenuScreen > MenuScreen > ...`
    // repeating many times over, real (not cosmetic) — genuinely huge, semantically meaningless
    // trees the panel then choked building/rendering. This is what filter-THEN-dedup fixes.
    const root = liveRoot();
    const text = new ShimElement('symbiote-text');
    Object.assign(text, {
      __svelte_meta: {
        loc: {
          file: '/repo/node_modules/@symbiote-native/navigation/build/Screen.svelte',
          line: 1,
          column: 0,
        },
        parent: {
          file: '/repo/examples/svelte/screens/MenuScreen.svelte',
          componentTag: 'Screen',
          parent: {
            file: '/repo/node_modules/@symbiote-native/navigation/build/Screen.svelte',
            componentTag: 'MenuScreen',
            parent: {
              file: '/repo/examples/svelte/screens/MenuScreen.svelte',
              componentTag: 'Screen',
              parent: {
                file: '/repo/examples/svelte/App.svelte',
                componentTag: 'MenuScreen',
                parent: null,
              },
            },
          },
        },
      },
    });

    root.appendChild(text);

    expect(text.engineNode?.owner).toEqual({
      chain: [
        { component: 'App', file: '/repo/examples/svelte/App.svelte' },
        {
          component: 'MenuScreen',
          file: '/repo/examples/svelte/screens/MenuScreen.svelte',
        },
      ],
    });
  });
});
