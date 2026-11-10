import { createLiveTree } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/vue';
import { h, nextTick } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkletEventHandler } from 'react-native-reanimated/src/WorkletEventHandler';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { settle, workletOf } from '../../test-support/worklet';
import { createAnimatedRef } from '../core/animated-ref';
import { createSharedValue } from '../core/shared-value';
import Animated from './animated';
import { AnimatedScrollView } from './animated-scroll-view';
import { useAnimatedScrollHandler } from './composables/use-animated-scroll-handler';
import '../register';

type IHandler = WorkletEventHandler<object>;

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 16_701;
const registered: IHandler[] = [];

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

async function mountScrollView(props: object) {
  mount(ROOT_TAG, { render: () => h(AnimatedScrollView, props) });
  await nextTick();
  await settle();
}

async function payloadOf(props: object): Promise<Record<string, unknown>> {
  const ref = createAnimatedRef();
  await mountScrollView({ ...props, ref });
  if (ref.current === null) throw new Error('the scroll view did not mount');
  return live.nodeOf(ref.current).payload;
}

describe('Animated.ScrollView', () => {
  it('is the component the default export carries', () => {
    expect(Animated.ScrollView).toBe(AnimatedScrollView);
  });

  it('asks for a scroll event every frame, as the author expects of an animation', async () => {
    const payload = await payloadOf({});

    expect(payload.scrollEventThrottle).toBe(1);
  });

  it('leaves the scroll event throttle the author chose alone', async () => {
    const payload = await payloadOf({ scrollEventThrottle: 16 });

    expect(payload.scrollEventThrottle).toBe(16);
  });

  it('hands the node to the animated ref the author gave', async () => {
    const ref = createAnimatedRef();

    await mountScrollView({ ref });

    const node = ref.current;
    if (node === null) throw new Error('the scroll view did not mount');
    expect(ref()).toBe(host.wrapperOf(node));
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
    const onScroll = useAnimatedScrollHandler(workletOf(vi.fn(), [], 71));

    await mountScrollView({ onScroll });

    expect(registered).toContain(onScroll.workletEventHandler);
  });
});
