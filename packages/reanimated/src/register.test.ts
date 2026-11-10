import { createLiveTree } from '@symbiote-native/test-utils';
import {
  createElement,
  createSurface,
  routeProp,
} from '@symbiote-native/engine';
import { describe, expect, it, vi } from 'vitest';
import { installWrapperHost } from '../test-support/wrapper-host';
import { workletOf } from '../test-support/worklet';
import {
  createAnimatedPropsController,
  createAnimatedStyleController,
} from './core/animated-style';
import { createEventHandler } from './core/event-handlers';
import './register';

vi.mock('react-native-reanimated/src/updateProps', () => ({
  updateProps: vi.fn(),
}));
vi.mock('react-native-reanimated/src/css/native/proxy', async () =>
  (await import('../test-support/css-proxy')).createCssProxyMock(),
);

const host = installWrapperHost();
const live = createLiveTree(host.fabric);

function committed(write: (node: ReturnType<typeof createElement>) => void) {
  const surface = createSurface(14_001);
  const node = createElement('RCTView');
  write(node);
  surface.appendChild(node);
  surface.commit();
  return live.nodeOf(node).payload;
}

describe('importing the register module', () => {
  it('lets an animated style show its starting values', () => {
    const updater = workletOf(() => ({ opacity: 0.3 }), []);
    const { handle } = createAnimatedStyleController(updater);

    const payload = committed(node => routeProp(node, 'style', handle));

    expect(payload.opacity).toBe(0.3);
  });

  it('keeps animated props out of the payload, with their starting values in', () => {
    const updater = workletOf(() => ({ accessibilityLabel: 'start' }), []);
    const { handle } = createAnimatedPropsController(updater);

    const payload = committed(node => routeProp(node, 'animatedProps', handle));

    expect(payload.accessibilityLabel).toBe('start');
    expect(Object.hasOwn(payload, 'animatedProps')).toBe(false);
  });

  it('keeps a worklet event handler out of the payload', () => {
    const { workletEventHandler } = createEventHandler(
      workletOf(() => undefined, []),
      ['onScroll'],
    );

    const payload = committed(node =>
      routeProp(node, 'onScroll', { workletEventHandler }),
    );

    expect(Object.hasOwn(payload, 'onScroll')).toBe(false);
  });

  it('keeps the layout animation props out of the payload', () => {
    const animation = () => ({
      animations: {},
      initialValues: {},
      callback: undefined,
    });

    const payload = committed(node => {
      routeProp(node, 'entering', animation);
      routeProp(node, 'layout', animation);
      routeProp(node, 'exiting', animation);
    });

    expect(Object.hasOwn(payload, 'entering')).toBe(false);
    expect(Object.hasOwn(payload, 'layout')).toBe(false);
    expect(Object.hasOwn(payload, 'exiting')).toBe(false);
  });

  it('keeps the CSS animation and transition keys out of the payload', () => {
    const payload = committed(node =>
      routeProp(node, 'style', {
        animationName: { from: { opacity: 0 }, to: { opacity: 1 } },
        animationDuration: '1s',
        transitionProperty: 'width',
        width: 10,
      }),
    );

    expect(payload.width).toBe(10);
    expect(Object.hasOwn(payload, 'animationName')).toBe(false);
    expect(Object.hasOwn(payload, 'animationDuration')).toBe(false);
    expect(Object.hasOwn(payload, 'transitionProperty')).toBe(false);
  });

  it('keeps the shared transition props out of the payload', () => {
    const payload = committed(node => {
      routeProp(node, 'sharedTransitionTag', 'hero');
      routeProp(node, 'sharedTransitionStyle', { build: () => undefined });
    });

    expect(Object.hasOwn(payload, 'sharedTransitionTag')).toBe(false);
    expect(Object.hasOwn(payload, 'sharedTransitionStyle')).toBe(false);
  });
});
