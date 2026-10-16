import { act, createElement } from 'react';
import { mount, unmount } from '@symbiote-native/react';
import { createLiveTree } from '@symbiote-native/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkletEventHandler } from 'react-native-reanimated/src/WorkletEventHandler';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { settle } from '../../test-support/worklet';
import { createAnimatedRef } from '../core/animated-ref';
import { createSharedValue } from '../core/shared-value';
import Animated from './animated';
import { AnimatedScrollView } from './animated-scroll-view';
import '../register';

type IHandler = WorkletEventHandler<object>;

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 16_201;
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
  act(() => unmount(ROOT_TAG));
  registered.splice(0);
  vi.useRealTimers();
});

function scroll(x: number, y: number) {
  return { eventName: 'onScroll', contentOffset: { x, y } };
}

async function payloadOf(props: object): Promise<Record<string, unknown>> {
  const ref = createAnimatedRef();
  act(() =>
    mount(ROOT_TAG, createElement(AnimatedScrollView, { ...props, ref })),
  );
  await settle();
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
});

describe('Animated.ScrollView with a scrollViewOffset', () => {
  it('writes its scroll position into the shared value it was given', async () => {
    const { shared } = createSharedValue(0);
    await payloadOf({ scrollViewOffset: shared });

    registered[0]?.worklet(scroll(0, 40));

    expect(shared.value).toBe(40);
  });

  it('registers for no scroll event when it was given no offset', async () => {
    await payloadOf({});

    expect(registered).toHaveLength(0);
  });

  it('hands the node to the animated ref the author gave, offset or none', async () => {
    const ref = createAnimatedRef();

    act(() => mount(ROOT_TAG, createElement(AnimatedScrollView, { ref })));
    await settle();

    expect(ref.current).not.toBeNull();
  });

  it('works without a ref from the author, which it then makes itself', async () => {
    const { shared } = createSharedValue(0);

    act(() =>
      mount(
        ROOT_TAG,
        createElement(AnimatedScrollView, { scrollViewOffset: shared }),
      ),
    );
    await settle();
    registered[0]?.worklet(scroll(0, 12));

    expect(shared.value).toBe(12);
  });
});
