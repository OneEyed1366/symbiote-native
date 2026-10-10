// `processDecelerationRate` на Android: имена `normal` и `fast` дают свои константы

import { registerScrollViewBehavior } from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  routeProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

registerScrollViewBehavior();

function decelerationOf(rate: unknown): unknown {
  const surface = createSurface(1);
  const node = createElement('RCTScrollView', false, 'scroll-view');
  routeProp(node, 'decelerationRate', rate);
  surface.appendChild(node);
  surface.commit();
  mounted();
  return committedPayloadOf(node)?.decelerationRate;
}

describe('ScrollView decelerationRate on Android', () => {
  it('maps normal and fast to the Android constants', () => {
    expect(decelerationOf('normal')).toBe(0.985);
    expect(decelerationOf('fast')).toBe(0.9);
  });

  it('passes a number through', () => {
    expect(decelerationOf(0.5)).toBe(0.5);
  });
});

report();
