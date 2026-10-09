import { afterEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  clearGlobalStyles,
  createElement,
  createSurface,
  registerRules,
  routeProp,
} from '../index';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 9_950;

function payloadOfClass(rules: object[]) {
  const base: object = { opacity: 1, width: 10 };
  registerRules([
    { tokens: ['btn'], specificity: [0, 1, 0], order: 0, style: base },
    ...rules.map((style, at) => ({
      tokens: ['btn'],
      specificity: [0, 2, 0] as const,
      order: at + 1,
      style,
    })),
  ]);
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  routeProp(node, 'className', 'btn');
  surface.appendChild(node);
  surface.commit();
  return live.nodeOf(node).payload;
}

afterEach(() => {
  clearGlobalStyles();
  Reflect.deleteProperty(globalThis, '__DEV__');
});

describe('a state rule with nothing registered to serve states, in a dev bundle', () => {
  it('throws, naming the property, the state and the package that serves it', () => {
    Reflect.set(globalThis, '__DEV__', true);

    expect(() => payloadOfClass([{ opacity: { ':active': 0.4 } }])).toThrow(
      /opacity.*:active.*@symbiote-native\/reanimated/,
    );
  });
});

describe('a state rule with nothing registered to serve states, in a release bundle', () => {
  it('ignores the whole property, its base included, and paints the rest', () => {
    const payload = payloadOfClass([{ opacity: { ':active': 0.4 } }]);

    expect(Object.hasOwn(payload, 'opacity')).toBe(false);
    expect(payload.width).toBe(10);
  });

  it('paints nothing for a property that only a state names', () => {
    const payload = payloadOfClass([{ height: { ':hover': 20 } }]);

    expect(Object.hasOwn(payload, 'height')).toBe(false);
    expect(payload.opacity).toBe(1);
  });
});
