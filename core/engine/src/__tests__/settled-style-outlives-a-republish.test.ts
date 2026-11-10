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
  settleNodeStyle,
} from '../index';
import { resetMutationBuffer, takeBatch } from '../mutation-buffer';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 10_000;

function mounted(style?: unknown) {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  if (style !== undefined) routeProp(node, 'style', style);
  surface.appendChild(node);
  surface.commit();
  return { surface, node };
}

afterEach(() => clearGlobalStyles());

describe('values an animation settled on', () => {
  it('reach the payload of a node that already committed', () => {
    const { surface, node } = mounted({ width: 10 });

    settleNodeStyle(node, { opacity: 0.3 });
    surface.commit();

    const { payload } = live.nodeOf(node);
    expect(payload.opacity).toBe(0.3);
    expect(payload.width).toBe(10);
  });

  it('reach the payload of a node that commits afterwards', () => {
    const surface = createSurface((nextRootTag += 1));
    const node = createElement('RCTView');
    settleNodeStyle(node, { opacity: 0.3 });
    surface.appendChild(node);
    surface.commit();

    expect(live.nodeOf(node).payload.opacity).toBe(0.3);
  });

  it('stay when the node style is published again', () => {
    registerRules([
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10 },
      },
    ]);
    const { surface, node } = mounted({ opacity: 1 });
    settleNodeStyle(node, { opacity: 0.3 });

    routeProp(node, 'className', 'card');
    surface.commit();

    const { payload } = live.nodeOf(node);
    expect(payload.opacity).toBe(0.3);
    expect(payload.padding).toBe(10);
  });

  it('win over the style the author wrote for the same key', () => {
    const { surface, node } = mounted({ opacity: 1 });

    settleNodeStyle(node, { opacity: 0.3 });
    surface.commit();

    expect(live.nodeOf(node).payload.opacity).toBe(0.3);
  });

  it('are kept key by key when a later settle names other keys', () => {
    const { surface, node } = mounted();

    settleNodeStyle(node, { opacity: 0.3 });
    settleNodeStyle(node, { width: 5 });
    surface.commit();

    const { payload } = live.nodeOf(node);
    expect(payload.opacity).toBe(0.3);
    expect(payload.width).toBe(5);
  });

  it('are replaced when a later settle names the same key', () => {
    const { surface, node } = mounted();

    settleNodeStyle(node, { opacity: 0.3 });
    settleNodeStyle(node, { opacity: 0.8 });
    surface.commit();

    expect(live.nodeOf(node).payload.opacity).toBe(0.8);
  });

  it('cost the host nothing when the same values are settled again', () => {
    const { surface, node } = mounted();
    settleNodeStyle(node, { opacity: 0.3 });
    surface.commit();
    resetMutationBuffer();
    takeBatch();

    settleNodeStyle(node, { opacity: 0.3 });

    expect(takeBatch().values.length).toBe(0);
  });
});
