import { createLiveTree } from '@symbiote-native/test-utils';
import {
  createElement,
  createSurface,
  getNativeTag,
  routeProp,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutAnimationType } from 'react-native-reanimated/src/commonTypes';
import * as featureFlags from 'react-native-reanimated/src/featureFlags';
import { updateLayoutAnimations } from 'react-native-reanimated/src/UpdateLayoutAnimations';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { claimLayoutAnimationProps } from './layout-animations';
import { claimSharedTransitionProps } from './shared-transitions';

vi.mock('react-native-reanimated/src/UpdateLayoutAnimations', () => ({
  updateLayoutAnimations: vi.fn(),
}));
vi.mock('react-native-reanimated/src/featureFlags', async importOriginal => ({
  ...(await importOriginal<typeof featureFlags>()),
  getStaticFeatureFlag: vi.fn(),
}));

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const update = vi.mocked(updateLayoutAnimations);
const flag = vi.mocked(featureFlags.getStaticFeatureFlag);
let nextRootTag = 18_000;
const releases: Array<() => void> = [];

beforeEach(() => {
  update.mockClear();
  flag.mockReturnValue(true);
  releases.push(claimLayoutAnimationProps(), claimSharedTransitionProps());
});

afterEach(() => {
  for (const release of releases.splice(0)) release();
});

function mounted(write: (node: ReturnType<typeof createElement>) => void) {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  write(node);
  surface.appendChild(node);
  return { surface, node };
}

const built = () => undefined;
const style = { build: () => built };
const other = { build: () => () => undefined };
const fade = () => ({ animations: {}, initialValues: {}, callback: undefined });

describe('a node with a shared transition tag', () => {
  it('is configured as it commits, under the native id it carries', () => {
    const { surface, node } = mounted(target => {
      routeProp(target, 'sharedTransitionTag', 'hero');
      routeProp(target, 'sharedTransitionStyle', style);
    });

    expect(update).not.toHaveBeenCalled();
    surface.commit();
    expect(update).toHaveBeenCalledTimes(1);
    const [id, type, config, , tag] = update.mock.calls[0] ?? [];
    expect(type).toBe(LayoutAnimationType.SHARED_ELEMENT_TRANSITION_NATIVE_ID);
    expect(config).toBe(built);
    expect(tag).toBe('hero');
    expect(live.nodeOf(node).payload.nativeID).toBe(String(id));
  });

  it('takes the style whichever of the two props comes first', () => {
    const { surface } = mounted(target => {
      routeProp(target, 'sharedTransitionStyle', style);
      routeProp(target, 'sharedTransitionTag', 'hero');
    });

    surface.commit();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[2]).toBe(built);
  });

  it('gets a default transition when it names no style', () => {
    const { surface } = mounted(target =>
      routeProp(target, 'sharedTransitionTag', 'hero'),
    );

    surface.commit();

    expect(typeof update.mock.calls[0]?.[2]).toBe('function');
  });

  it('shares its native id with its entering animation', () => {
    const { surface } = mounted(target => {
      routeProp(target, 'entering', fade);
      routeProp(target, 'sharedTransitionTag', 'hero');
    });

    surface.commit();

    const ids = update.mock.calls.map(([id]) => id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it('stays out of the committed payload, together with its style', () => {
    const { surface, node } = mounted(target => {
      routeProp(target, 'sharedTransitionTag', 'hero');
      routeProp(target, 'sharedTransitionStyle', style);
    });

    surface.commit();

    const payload = live.nodeOf(node).payload;
    expect(Object.hasOwn(payload, 'sharedTransitionTag')).toBe(false);
    expect(Object.hasOwn(payload, 'sharedTransitionStyle')).toBe(false);
  });

  it('is left alone while the static feature flag is off', () => {
    flag.mockReturnValue(false);

    const { surface } = mounted(target =>
      routeProp(target, 'sharedTransitionTag', 'hero'),
    );
    surface.commit();

    expect(update).not.toHaveBeenCalled();
  });
});

describe('a node that gets a shared transition tag after it committed', () => {
  it('is configured under its tag', () => {
    const { surface, node } = mounted(() => undefined);
    surface.commit();

    routeProp(node, 'sharedTransitionTag', 'hero');
    surface.commit();

    expect(update).toHaveBeenCalledWith(
      getNativeTag(node),
      LayoutAnimationType.SHARED_ELEMENT_TRANSITION,
      expect.any(Function),
      undefined,
      'hero',
    );
  });

  it('is configured again when the style is another one', () => {
    const { surface, node } = mounted(target => {
      routeProp(target, 'sharedTransitionTag', 'hero');
      routeProp(target, 'sharedTransitionStyle', style);
    });
    surface.commit();
    update.mockClear();

    routeProp(node, 'sharedTransitionStyle', other);
    surface.commit();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]).toBe(getNativeTag(node));
  });

  it('is configured once however often the same style is passed', () => {
    const { surface, node } = mounted(target => {
      routeProp(target, 'sharedTransitionTag', 'hero');
      routeProp(target, 'sharedTransitionStyle', style);
    });
    surface.commit();
    update.mockClear();

    routeProp(node, 'sharedTransitionTag', 'hero');
    routeProp(node, 'sharedTransitionStyle', style);
    surface.commit();

    expect(update).not.toHaveBeenCalled();
  });

  it('is taken out when the tag goes', () => {
    const { surface, node } = mounted(target =>
      routeProp(target, 'sharedTransitionTag', 'hero'),
    );
    surface.commit();
    update.mockClear();

    routeProp(node, 'sharedTransitionTag', undefined);
    surface.commit();

    expect(update).toHaveBeenCalledWith(
      getNativeTag(node),
      LayoutAnimationType.SHARED_ELEMENT_TRANSITION,
      undefined,
      undefined,
      undefined,
    );
  });
});
