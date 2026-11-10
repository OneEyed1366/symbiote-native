// `LayoutConformance.js` renders its native component with `style={styles.container}`, which is
// `display: contents`, and spreads the props first, so an app style never reaches native

import { registerLayoutConformanceBehavior } from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

registerLayoutConformanceBehavior();

function commit(props: Record<string, unknown>) {
  const surface = createSurface(ROOT_TAG);
  const node = createElement('LayoutConformance', false, 'layout-conformance');
  for (const [name, value] of Object.entries(props))
    routeProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();
  return {
    payload: committedPayloadOf(node) ?? {},
    folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0,
  };
}

describe('what a LayoutConformance sends native, resolved by the engine', () => {
  // The price: the rule lives in C++, so no trip into JS is paid for it
  it('costs no trip into JS at all', () => {
    expect(commit({ mode: 'strict' }).folds).toBe(0);
  });

  it('paints as `display: contents` and drops the app style', () => {
    const { payload } = commit({
      mode: 'strict',
      style: { display: 'flex', opacity: 0.5 },
    });

    expect(payload.mode).toBe('strict');
    expect(payload.display).toBe('contents');
    expect(payload.opacity).toBe(undefined);
  });
});

report();
