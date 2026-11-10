// Семью Fabric при reparent пересоздаёт только настоящий движок, headless-хост не умеет

import {
  appendChild,
  createElement,
  createSurface,
  registerStyleHandleClaim,
  removeChild,
  routeProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

type IHandle = { readonly initial: Record<string, unknown> };

function isHandle(part: unknown): part is IHandle {
  return typeof part === 'object' && part !== null && 'initial' in part;
}

let attached = 0;
let released = 0;

registerStyleHandleClaim({
  isHandle,
  initialOf: handle => (isHandle(handle) ? handle.initial : undefined),
  attach: () => {
    attached += 1;
    return () => {
      released += 1;
    };
  },
});

describe('a style handle on a node that is moved', () => {
  it('is let go and bound again once its family is re-created', () => {
    const first = createElement('RCTView');
    const second = createElement('RCTView');
    const child = createElement('RCTView');
    routeProp(child, 'style', { initial: { opacity: 1 } });
    appendChild(first, child);
    const surface = createSurface(1);
    surface.appendChild(first);
    surface.appendChild(second);
    surface.commit();
    mounted();
    expect(attached).toBe(1);

    removeChild(first, child);
    appendChild(second, child);
    surface.commit();
    mounted();

    expect(released).toBe(1);
    expect(attached).toBe(2);
  });

  it('stays bound across a commit that moves nothing', () => {
    const before = attached;
    const node = createElement('RCTView');
    routeProp(node, 'style', { initial: { opacity: 1 } });
    const surface = createSurface(2);
    surface.appendChild(node);
    surface.commit();
    mounted();
    routeProp(node, 'testID', 'changed');
    surface.commit();
    mounted();

    expect(attached).toBe(before + 1);
  });
});

report();
