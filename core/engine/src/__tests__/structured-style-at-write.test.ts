// The seven style keys React Native parses in JS — boxShadow, filter, transform, transformOrigin,
// aspectRatio, fontVariant, experimental_backgroundImage — must be resolved by the time the value
// is in `node.props`, not on the way out of it.
//
// WHY THAT IS THE ASSERTION. On a device the payload is built by
// `core/engine/cpp/SymbioteFabricProps.cpp`, which carries none of these — they are pure JS. So a
// value resolved inside `fabric-props.ts` is resolved HEADLESS ONLY, and the device commits the raw
// CSS string. Fabric parses a style string only under `enableNativeCSSParsing()`, which defaults to
// false, so the declaration is dropped with no warning and no wrong value — the gradient is simply
// not there. Every case below therefore reads what the HOST holds, never what `fabricProps`
// returns: asserting on the payload would pass with the bug in place.
//
// The identity group is the other half. `pushClassStyle` compares what it is about to publish
// against what it published last, and the host skips a same-identity write — so a resolver that
// mints a fresh object per write would turn every unchanged class into a write and a dirty node.
// That cost is invisible on React/Vue/Svelte (each diffs props first) and 500x on Solid, which is
// how it was found the first time.

import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  createElement,
  propOf,
  routeProp,
  setProp,
} from '@symbiote-native/engine';

installFabric();

const VIEW = 'RCTView';
const GRADIENT = 'linear-gradient(to right, #2c4f7c, #76b3e1)';

// What the host is holding under `style`, flattened out of the `[classStyle, explicitStyle]` array
// routeProp publishes. This is the bag the C++ payload builder reads on a device.
function committedStyle(node: ReturnType<typeof createElement>): unknown {
  const style = propOf(node, 'style');
  const entries = Array.isArray(style) ? style : [style];
  const out: Record<string, unknown> = {};
  for (const entry of entries) {
    if (entry !== null && typeof entry === 'object')
      Object.assign(out, entry as Record<string, unknown>);
  }
  return out;
}

describe('Positive', () => {
  // why: THE BUG, in the shape the canary hit it — `.gradient-card` carries the gradient as a CSS
  // string, and a string is what iOS drops.
  it('resolves a CSS-string gradient before it reaches the host', () => {
    const node = createElement(VIEW);
    routeProp(node, 'style', { experimental_backgroundImage: GRADIENT });

    const resolved = committedStyle(node);
    expect(resolved).not.toHaveProperty(
      'experimental_backgroundImage',
      GRADIENT,
    );
    expect(
      Array.isArray(
        (resolved as Record<string, unknown>).experimental_backgroundImage,
      ),
      'processBackgroundImage yields the structured array Fabric expects',
    ).toBe(true);
  });

  // why: `setNativeProps` has no `routeProp` in front of it — the same gap that let a cyclic
  // `__self` reach the C++ conversion and hang the JS thread. A resolver on the declarative path
  // alone would leave every animated frame unresolved.
  it('resolves on the imperative path too, which skips routeProp', () => {
    const node = createElement(VIEW);
    setProp(node, 'style', { transform: 'rotate(45deg)' });

    const { transform } = committedStyle(node) as Record<string, unknown>;
    expect(transform).not.toBe('rotate(45deg)');
    expect(transform).toEqual([{ rotate: '45deg' }]);
  });

  // why: the memo has to key on the style OBJECT, because a class-resolved style is one cached
  // object shared by every row that names the class.
  it('resolves one shared style object once', () => {
    const shared = { experimental_backgroundImage: GRADIENT };
    const first = createElement(VIEW);
    const second = createElement(VIEW);
    routeProp(first, 'style', shared);
    routeProp(second, 'style', shared);

    const a = committedStyle(first) as Record<string, unknown>;
    const b = committedStyle(second) as Record<string, unknown>;
    // Both halves are needed: two nodes holding the same unresolved STRING would satisfy the
    // identity check on its own, so the case has to say the value was resolved as well.
    expect(Array.isArray(a.experimental_backgroundImage)).toBe(true);
    expect(a.experimental_backgroundImage).toBe(b.experimental_backgroundImage);
  });
});

describe('Negative', () => {
  // why: nearly every style has none of the seven keys, and for those the resolver must be
  // invisible — same object out, or the write guards downstream stop firing.
  it('hands an unaffected style back by identity', () => {
    const plain = { flex: 1, backgroundColor: '#ff0000' };
    const node = createElement(VIEW);
    setProp(node, 'style', plain);

    expect(propOf(node, 'style')).toBe(plain);
  });

  // why: the array is what routeProp publishes, and it is minted fresh on every push — so the
  // resolver must not add a second layer of new identity on top of unaffected entries.
  it('hands an unaffected style ARRAY back by identity', () => {
    const slots = [{ flex: 1 }, { opacity: 0.5 }];
    const node = createElement(VIEW);
    setProp(node, 'style', slots);

    expect(propOf(node, 'style')).toBe(slots);
  });

  // why: the control. If the probe read the payload instead of the host, or if something else were
  // resolving these, a key that needs NO resolution would still look converted — this pins that an
  // untouched key survives verbatim.
  it('leaves a key no processor claims exactly as written', () => {
    const node = createElement(VIEW);
    setProp(node, 'style', { flexDirection: 'row' });

    expect(
      (committedStyle(node) as Record<string, unknown>).flexDirection,
    ).toBe('row');
  });
});
