import { createLiveTree } from '@symbiote-native/test-utils';
import {
  createElement,
  createSurface,
  getNativeTag,
  routeProp,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutAnimationType } from 'react-native-reanimated/src/commonTypes';
import { updateLayoutAnimations } from 'react-native-reanimated/src/UpdateLayoutAnimations';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { claimLayoutAnimationProps } from './layout-animations';

vi.mock('react-native-reanimated/src/UpdateLayoutAnimations', () => ({
  updateLayoutAnimations: vi.fn(),
}));

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const update = vi.mocked(updateLayoutAnimations);
let nextRootTag = 17_000;
const releases: Array<() => void> = [];

beforeEach(() => {
  update.mockClear();
  releases.push(claimLayoutAnimationProps());
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

const fade = () => ({ animations: {}, initialValues: {}, callback: undefined });
const slide = () => ({
  animations: {},
  initialValues: {},
  callback: undefined,
});

describe('the entering animation of a node', () => {
  it('is configured before the node commits, under the native id the node carries', () => {
    const { surface, node } = mounted(target =>
      routeProp(target, 'entering', fade),
    );

    expect(update).toHaveBeenCalledTimes(1);
    surface.commit();
    const [id, type, config] = update.mock.calls[0] ?? [];
    expect(type).toBe(LayoutAnimationType.ENTERING);
    expect(config).toBe(fade);
    expect(live.nodeOf(node).payload.nativeID).toBe(String(id));
    expect(String(id)).toMatch(/^\d{1,9}$/);
  });

  it('stays out of the committed payload', () => {
    const { surface, node } = mounted(target =>
      routeProp(target, 'entering', fade),
    );

    surface.commit();

    expect(Object.hasOwn(live.nodeOf(node).payload, 'entering')).toBe(false);
  });

  it('gives each node an id of its own', () => {
    mounted(target => routeProp(target, 'entering', fade));
    mounted(target => routeProp(target, 'entering', fade));

    const ids = update.mock.calls.map(([id]) => id);
    expect(new Set(ids).size).toBe(2);
  });

  it('builds a builder into the function native takes', () => {
    const built = fade;
    const builder = { build: () => built };

    mounted(target => routeProp(target, 'entering', builder));

    expect(update.mock.calls[0]?.[2]).toBe(built);
  });
});

describe.each([
  ['layout', LayoutAnimationType.LAYOUT],
  ['exiting', LayoutAnimationType.EXITING],
] as const)('the %s animation of a node', (key, type) => {
  it('is configured under the tag of the node once it has committed', () => {
    const { surface, node } = mounted(target => routeProp(target, key, fade));
    expect(update).not.toHaveBeenCalled();

    surface.commit();

    expect(update).toHaveBeenCalledWith(getNativeTag(node), type, fade);
  });

  it('is configured again when the animation is another one', () => {
    const { surface, node } = mounted(target => routeProp(target, key, fade));
    surface.commit();
    update.mockClear();

    routeProp(node, key, slide);
    surface.commit();

    expect(update).toHaveBeenCalledWith(getNativeTag(node), type, slide);
  });

  it('is configured once however often the same animation is passed', () => {
    const { surface, node } = mounted(target => routeProp(target, key, fade));
    surface.commit();
    update.mockClear();

    routeProp(node, key, fade);
    surface.commit();

    expect(update).not.toHaveBeenCalled();
  });

  it('is removed when the prop is', () => {
    const { surface, node } = mounted(target => routeProp(target, key, fade));
    surface.commit();
    update.mockClear();

    routeProp(node, key, undefined);
    surface.commit();

    expect(update).toHaveBeenCalledWith(getNativeTag(node), type, undefined);
  });

  it('stays out of the committed payload', () => {
    const { surface, node } = mounted(target => routeProp(target, key, fade));

    surface.commit();

    expect(Object.hasOwn(live.nodeOf(node).payload, key)).toBe(false);
  });
});
