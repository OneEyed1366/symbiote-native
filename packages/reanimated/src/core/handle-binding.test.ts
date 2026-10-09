import { createLiveTree } from '@symbiote-native/test-utils';
import {
  createElement,
  createSurface,
  getNativeTag,
  routeProp,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateProps } from 'react-native-reanimated/src/updateProps';
import { installWrapperHost } from '../../test-support/wrapper-host';
import {
  recordUpdateWrites,
  type IUpdateWrite,
} from '../../test-support/update-writes';
import { settle, workletOf } from '../../test-support/worklet';
import {
  createAnimatedPropsController,
  createAnimatedStyleController,
} from './animated-style';
import { createSharedValue } from './shared-value';
import {
  claimAnimatedPropsHandles,
  claimAnimatedStyleHandles,
} from './handle-binding';

vi.mock('react-native-reanimated/src/updateProps', () => ({
  updateProps: vi.fn(),
}));

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
let nextRootTag = 13_000;
const releases: Array<() => void> = [];
const writes: IUpdateWrite[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  recordUpdateWrites(updateProps, writes);
  releases.push(claimAnimatedStyleHandles(), claimAnimatedPropsHandles());
});

afterEach(() => {
  for (const release of releases.splice(0)) release();
  vi.useRealTimers();
});

function animatedOpacity(start: number) {
  const { shared } = createSharedValue(start);
  const updater = workletOf(() => ({ opacity: shared.value }), [shared]);
  const controller = createAnimatedStyleController(updater);
  controller.start(updater);
  return { shared, controller };
}

function animatedLabel(start: string) {
  const { shared } = createSharedValue(start);
  const updater = workletOf(
    () => ({ accessibilityLabel: shared.value }),
    [shared],
  );
  const controller = createAnimatedPropsController(updater);
  controller.start(updater);
  return { shared, controller };
}

function mounted(write: (node: ReturnType<typeof createElement>) => void) {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  write(node);
  surface.appendChild(node);
  return { surface, node };
}

describe('an animated style worn by a node', () => {
  it('shows its starting values in the first committed payload', () => {
    const { controller } = animatedOpacity(0.4);
    const { surface, node } = mounted(target =>
      routeProp(target, 'style', [{ width: 10 }, controller.handle]),
    );

    surface.commit();

    const committed = live.nodeOf(node);
    expect(committed.payload.opacity).toBe(0.4);
    expect(committed.payload.width).toBe(10);
  });

  it('is written to the node the UI side knows by tag and wrapper once it has committed', async () => {
    const { shared, controller } = animatedOpacity(1);
    const { surface, node } = mounted(target =>
      routeProp(target, 'style', controller.handle),
    );
    surface.commit();
    await settle();
    writes.length = 0;

    shared.value = 0.25;
    await settle();

    expect(writes).toEqual([
      {
        views: [
          { tag: getNativeTag(node), shadowNodeWrapper: host.wrapperOf(node) },
        ],
        updates: { opacity: 0.25 },
        isAnimatedProps: false,
      },
    ]);
  });

  it('is no longer written to the node once the node has left the tree', async () => {
    const { shared, controller } = animatedOpacity(1);
    const { surface, node } = mounted(target =>
      routeProp(target, 'style', controller.handle),
    );
    surface.commit();
    await settle();

    surface.removeChild(node);
    surface.commit();
    await settle();
    writes.length = 0;
    shared.value = 0.1;
    await settle();

    // The mapper still runs, but over no views
    expect(writes).toEqual([
      { views: [], updates: { opacity: 0.1 }, isAnimatedProps: false },
    ]);
  });
});

describe('a node an animation drives', () => {
  it('is not collapsed when it wears an animated style', () => {
    const { controller } = animatedOpacity(1);
    const { surface, node } = mounted(target =>
      routeProp(target, 'style', controller.handle),
    );

    surface.commit();

    expect(live.nodeOf(node).payload.collapsable).toBe(false);
  });

  it('is not collapsed when it wears animated props', () => {
    const { controller } = animatedLabel('first');
    const { surface, node } = mounted(target =>
      routeProp(target, 'animatedProps', controller.handle),
    );

    surface.commit();

    expect(live.nodeOf(node).payload.collapsable).toBe(false);
  });
});

describe('animated props worn by a node', () => {
  it('show their starting values and stay out of the payload themselves', () => {
    const { controller } = animatedLabel('first');
    const { surface, node } = mounted(target =>
      routeProp(target, 'animatedProps', controller.handle),
    );

    surface.commit();

    const payload = live.nodeOf(node).payload;
    expect(payload.accessibilityLabel).toBe('first');
    expect(Object.hasOwn(payload, 'animatedProps')).toBe(false);
  });

  it('are written to the node as props once it has committed', async () => {
    const { shared, controller } = animatedLabel('first');
    const { surface, node } = mounted(target =>
      routeProp(target, 'animatedProps', controller.handle),
    );
    surface.commit();
    await settle();
    writes.length = 0;

    shared.value = 'second';
    await settle();

    expect(writes).toEqual([
      {
        views: [
          { tag: getNativeTag(node), shadowNodeWrapper: host.wrapperOf(node) },
        ],
        updates: { accessibilityLabel: 'second' },
        isAnimatedProps: true,
      },
    ]);
  });

  it('are no longer written to the node once the prop is removed', async () => {
    const { shared, controller } = animatedLabel('first');
    const { surface, node } = mounted(target =>
      routeProp(target, 'animatedProps', controller.handle),
    );
    surface.commit();
    await settle();

    routeProp(node, 'animatedProps', undefined);
    await settle();
    writes.length = 0;
    shared.value = 'second';
    await settle();

    expect(writes).toEqual([
      {
        views: [],
        updates: { accessibilityLabel: 'second' },
        isAnimatedProps: true,
      },
    ]);
  });

  it('move to the new animated props when another handle is passed', async () => {
    const first = animatedLabel('first');
    const second = animatedLabel('other');
    const { surface, node } = mounted(target =>
      routeProp(target, 'animatedProps', first.controller.handle),
    );
    surface.commit();
    await settle();

    routeProp(node, 'animatedProps', second.controller.handle);
    surface.commit();
    await settle();
    writes.length = 0;
    first.shared.value = 'stale';
    second.shared.value = 'fresh';
    await settle();

    const reached = writes.filter(write => write.views.length > 0);
    expect(reached.map(write => write.updates)).toEqual([
      { accessibilityLabel: 'fresh' },
    ]);
  });
});
