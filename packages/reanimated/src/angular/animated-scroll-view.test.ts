import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { createLiveTree } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkletEventHandler } from 'react-native-reanimated/src/WorkletEventHandler';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { renderComposable } from '../../test-support/render-angular-composable';
import { settle, workletOf } from '../../test-support/worklet';
import { createAnimatedRef } from '../core/animated-ref';
import { createSharedValue } from '../core/shared-value';
import { AnimatedScrollView } from './animated-scroll-view';
import { hooks } from './services/hooks';
import '../register';

type IHandler = WorkletEventHandler<object>;

const { useAnimatedScrollHandler } = hooks;
const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 16_861;
const registered: IHandler[] = [];
let hostCount = 0;

vi.spyOn(WorkletEventHandler.prototype, 'registerForEvents').mockImplementation(
  function (this: IHandler) {
    registered.push(this);
    return 0;
  },
);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  unmount(ROOT_TAG);
  registered.splice(0);
  vi.useRealTimers();
});

function scroll(x: number, y: number) {
  return { eventName: 'onScroll', contentOffset: { x, y } };
}

// The inputs of the scroll view under test, set on a host that binds each of them
function hostWith(inputs: object) {
  hostCount += 1;
  @Component({
    selector: `scroll-host-${hostCount}`,
    standalone: true,
    imports: [AnimatedScrollView],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template: `<AnimatedScrollView
      [animatedRef]="animatedRef"
      [scrollViewOffset]="scrollViewOffset"
      [scrollViewProps]="scrollViewProps"
    />`,
  })
  class Host {
    animatedRef = undefined;
    scrollViewOffset = undefined;
    scrollViewProps = {};
    constructor() {
      Object.assign(this, inputs);
    }
  }
  return Host;
}

async function mountScrollView(inputs: object) {
  mount(ROOT_TAG, hostWith(inputs));
  await vi.advanceTimersByTimeAsync(0);
  await settle();
}

async function payloadOf(
  scrollViewProps: object,
): Promise<Record<string, unknown>> {
  const animatedRef = createAnimatedRef();
  await mountScrollView({ animatedRef, scrollViewProps });
  if (animatedRef.current === null)
    throw new Error('the scroll view did not mount');
  return live.nodeOf(animatedRef.current).payload;
}

describe('Animated.ScrollView', () => {
  it('asks for a scroll event every frame, as the author expects of an animation', async () => {
    const payload = await payloadOf({});

    expect(payload.scrollEventThrottle).toBe(1);
  });

  it('leaves the scroll event throttle the author chose alone', async () => {
    const payload = await payloadOf({ scrollEventThrottle: 16 });

    expect(payload.scrollEventThrottle).toBe(16);
  });

  it('commits nestedScrollEnabled when the author put it in scrollViewProps', async () => {
    const payload = await payloadOf({ nestedScrollEnabled: true });

    expect(payload.nestedScrollEnabled).toBe(true);
  });

  it('hands the node to the animated ref the author gave', async () => {
    const animatedRef = createAnimatedRef();

    await mountScrollView({ animatedRef });

    const node = animatedRef.current;
    if (node === null) throw new Error('the scroll view did not mount');
    expect(animatedRef()).toBe(host.wrapperOf(node));
  });
});

describe('Animated.ScrollView with a scrollViewOffset', () => {
  it('writes its scroll position into the shared value it was given', async () => {
    const { shared } = createSharedValue(0);
    await mountScrollView({ scrollViewOffset: shared });

    registered[0]?.worklet(scroll(0, 40));

    expect(shared.value).toBe(40);
  });

  it('registers for no scroll event when it was given no offset', async () => {
    await mountScrollView({});

    expect(registered).toHaveLength(0);
  });
});

describe('Animated.ScrollView with a worklet scroll handler', () => {
  it('registers the handler for the events of its node', async () => {
    const handler = await renderComposable(() =>
      useAnimatedScrollHandler(workletOf(vi.fn(), [], 71)),
    );
    const onScroll = handler.result();

    await mountScrollView({ scrollViewProps: { onScroll } });

    expect(registered).toContain(onScroll.workletEventHandler);
    handler.unmount();
  });
});
