import {
  clearGlobalStyles,
  createElement,
  createSurface,
  getNativeTag,
  registerRules,
  routeProp,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cssCallbacksRegistry,
  type NativeCSSEvent,
} from 'react-native-reanimated/src/css/native/events';
import * as proxy from 'react-native-reanimated/src/css/native/proxy';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { claimCssStyle } from './css-binding';

vi.mock('react-native-reanimated/src/css/native/proxy', async () =>
  (await import('../../test-support/css-proxy')).createCssProxyMock(),
);

const host = installWrapperHost();
let nextRootTag = 22_000;
const releases: Array<() => void> = [];

beforeEach(() => {
  vi.clearAllMocks();
  releases.push(claimCssStyle());
});

afterEach(() => {
  for (const release of releases.splice(0)) release();
});

const FADE = { from: { opacity: 0 }, to: { opacity: 1 } };

function mounted(style: object) {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  routeProp(node, 'style', style);
  surface.appendChild(node);
  surface.commit();
  return { surface, node };
}

describe('a node whose style names a CSS animation', () => {
  it('has the animation applied to its Fabric node once it has committed', () => {
    const { node } = mounted({ animationName: FADE, animationDuration: '1s' });

    expect(proxy.registerCSSKeyframes).toHaveBeenCalledTimes(1);
    expect(proxy.applyCSSAnimations).toHaveBeenCalledTimes(1);
    const [wrapper, compoundName, updates] =
      vi.mocked(proxy.applyCSSAnimations).mock.calls[0] ?? [];
    expect(wrapper).toBe(host.wrapperOf(node));
    expect(compoundName).toMatch(/^RCTView\$/);
    expect(updates?.animationNames).toHaveLength(1);
  });

  it('has the animation taken off when the style stops naming one', () => {
    const { surface, node } = mounted({
      animationName: FADE,
      animationDuration: '1s',
    });
    vi.mocked(proxy.applyCSSAnimations).mockClear();

    routeProp(node, 'style', { width: 10 });
    surface.commit();

    expect(proxy.unregisterCSSAnimations).toHaveBeenCalledTimes(1);
  });

  it('is let go of when the node leaves the tree', () => {
    const { surface, node } = mounted({
      animationName: FADE,
      animationDuration: '1s',
    });

    surface.removeChild(node);
    surface.commit();

    expect(proxy.markNodeAsRemovable).toHaveBeenCalledWith(
      host.wrapperOf(node),
    );
  });
});

describe('a node whose style names keyframes declared in another file', () => {
  function declared(...names: string[]) {
    const style = Object.fromEntries(
      names.map(name => [`@keyframes ${name}`, FADE]),
    );
    registerRules([{ tokens: [], specificity: [0, 0, 0], order: 0, style }]);
  }

  function appliedCount(): number | undefined {
    const call = vi.mocked(proxy.applyCSSAnimations).mock.calls[0];
    const updates = call?.[2];
    return updates?.animationNames?.length;
  }

  afterEach(() => clearGlobalStyles());

  it('gets the animation, with the steps the registry holds under that name', () => {
    declared('fade');

    mounted({ animationName: 'fade', animationDuration: '1s' });

    expect(proxy.applyCSSAnimations).toHaveBeenCalledTimes(1);
    expect(appliedCount()).toBe(1);
  });

  it('gets each of several names', () => {
    declared('fade', 'spin');

    mounted({ animationName: ['fade', 'spin'], animationDuration: '1s' });

    expect(appliedCount()).toBe(2);
  });

  it('runs nothing for a name no file declared', () => {
    mounted({ animationName: 'nowhere', animationDuration: '1s' });

    expect(proxy.applyCSSAnimations).not.toHaveBeenCalled();
  });

  it('keeps the animation of a name it knows next to one it does not', () => {
    declared('fade');

    mounted({ animationName: ['fade', 'nowhere'], animationDuration: '1s' });

    expect(appliedCount()).toBe(1);
  });

  it('keeps the duration listed for the name it kept', () => {
    declared('fade');

    mounted({
      animationName: ['nowhere', 'fade'],
      animationDuration: ['1s', '2s'],
    });

    const call = vi.mocked(proxy.applyCSSAnimations).mock.calls[0];
    const settings = call?.[2]?.newAnimationSettings;
    expect(settings?.[0]?.duration).toBe(2000);
  });
});

describe('a node whose style names a CSS transition', () => {
  const transition = {
    transitionProperty: 'opacity',
    transitionDuration: '1s',
  };

  it('runs the transition when the property changes with the same style around it', () => {
    const { surface, node } = mounted({ ...transition, opacity: 1 });
    vi.mocked(proxy.runCSSTransition).mockClear();

    routeProp(node, 'style', { ...transition, opacity: 0.5 });
    surface.commit();

    expect(proxy.runCSSTransition).toHaveBeenCalledTimes(1);
    expect(vi.mocked(proxy.runCSSTransition).mock.calls[0]?.[0]).toBe(
      host.wrapperOf(node),
    );
  });

  it('runs nothing when a property that is not transitioned changes', () => {
    const { surface, node } = mounted({ ...transition, width: 10 });
    vi.mocked(proxy.runCSSTransition).mockClear();

    routeProp(node, 'style', { ...transition, width: 20 });
    surface.commit();

    expect(proxy.runCSSTransition).not.toHaveBeenCalled();
  });
});

describe('a node that names a CSS event callback', () => {
  const animation = { animationName: FADE, animationDuration: '1s' };

  function endAnimation(node: ReturnType<typeof createElement>) {
    const tag = getNativeTag(node);
    if (tag === undefined) throw new Error('the node has no native tag');
    const event: NativeCSSEvent = {
      tag,
      type: 'animationEnd',
      name: 'fade',
      elapsedTime: 1,
    };
    cssCallbacksRegistry.dispatch([event]);
  }

  afterEach(() => cssCallbacksRegistry.clear());

  it('hears the end of the animation, with its name and elapsed time', () => {
    const onEnd = vi.fn();
    const surface = createSurface((nextRootTag += 1));
    const node = createElement('RCTView');
    routeProp(node, 'style', animation);
    routeProp(node, 'onCSSAnimationEnd', onEnd);
    surface.appendChild(node);
    surface.commit();

    endAnimation(node);

    expect(onEnd).toHaveBeenCalledWith({
      animationName: 'fade',
      elapsedTime: 1,
    });
  });

  it('hears it when the callback is named after the node has committed', () => {
    const onEnd = vi.fn();
    const { node } = mounted(animation);

    routeProp(node, 'onCSSAnimationEnd', onEnd);
    endAnimation(node);

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('stops hearing it once the callback is taken off', () => {
    const onEnd = vi.fn();
    const { node } = mounted(animation);
    routeProp(node, 'onCSSAnimationEnd', onEnd);

    routeProp(node, 'onCSSAnimationEnd', undefined);
    endAnimation(node);

    expect(onEnd).not.toHaveBeenCalled();
  });
});

describe('a node whose style gives a value for a pseudo state', () => {
  const hoverable = { opacity: { default: 0.5, ':hover': 1 }, width: 10 };

  afterEach(() => clearGlobalStyles());

  it('has the pseudo styles registered on its Fabric node once it has committed', () => {
    const { node } = mounted(hoverable);

    expect(proxy.registerPseudoStyles).toHaveBeenCalledTimes(1);
    expect(vi.mocked(proxy.registerPseudoStyles).mock.calls[0]?.[0]).toBe(
      host.wrapperOf(node),
    );
  });

  it('has them registered from the state rule of a stylesheet class', () => {
    const base: object = { opacity: 1 };
    const hover: object = { opacity: { ':hover': 0.5 } };
    registerRules([
      { tokens: ['btn'], specificity: [0, 1, 0], order: 0, style: base },
      { tokens: ['btn'], specificity: [0, 2, 0], order: 1, style: hover },
    ]);
    const surface = createSurface((nextRootTag += 1));
    const node = createElement('RCTView');
    routeProp(node, 'className', 'btn');
    surface.appendChild(node);
    surface.commit();

    expect(proxy.registerPseudoStyles).toHaveBeenCalledTimes(1);
  });

  it('has them taken off when the style stops giving one', () => {
    const { surface, node } = mounted(hoverable);

    routeProp(node, 'style', { opacity: 0.5, width: 10 });
    surface.commit();

    expect(proxy.unregisterPseudoStyles).toHaveBeenCalledTimes(1);
  });
});

describe('a node whose style carries no CSS animation or transition', () => {
  it('is left to the native side untouched', () => {
    mounted({ width: 10 });

    expect(proxy.applyCSSAnimations).not.toHaveBeenCalled();
    expect(proxy.runCSSTransition).not.toHaveBeenCalled();
  });
});
