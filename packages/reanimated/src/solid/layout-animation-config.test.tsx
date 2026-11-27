import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { LayoutAnimationType } from 'react-native-reanimated/src/commonTypes';
import { updateLayoutAnimations } from 'react-native-reanimated/src/UpdateLayoutAnimations';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { LayoutAnimationConfig } from './layout-animation-config';
import '../register';

vi.mock('react-native-reanimated/src/UpdateLayoutAnimations', () => ({
  updateLayoutAnimations: vi.fn(),
}));

installWrapperHost();
const ROOT_TAG = 19_701;
const update = vi.mocked(updateLayoutAnimations);

beforeEach(() => update.mockClear());
afterEach(() => unmount(ROOT_TAG));

const fade = () => ({ animations: {}, initialValues: {}, callback: undefined });
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function enteringSent(): boolean {
  return update.mock.calls.some(([, type]) => {
    return type === LayoutAnimationType.ENTERING;
  });
}

async function mountTree(App: () => unknown) {
  mount(ROOT_TAG, App);
  await tick();
}

describe('LayoutAnimationConfig', () => {
  it('skips the entering animation of the views under it when they mount with it', async () => {
    await mountTree(() => (
      <LayoutAnimationConfig skipEntering>
        <view entering={fade} />
      </LayoutAnimationConfig>
    ));

    expect(enteringSent()).toBe(false);
  });

  it('lets the views under it animate in when it does not skip', async () => {
    await mountTree(() => (
      <LayoutAnimationConfig skipEntering={false}>
        <view entering={fade} />
      </LayoutAnimationConfig>
    ));

    expect(enteringSent()).toBe(true);
  });

  it('skips a view nested under other views, not only its own children', async () => {
    await mountTree(() => (
      <LayoutAnimationConfig skipEntering>
        <view>
          <view>
            <view entering={fade} />
          </view>
        </view>
      </LayoutAnimationConfig>
    ));

    expect(enteringSent()).toBe(false);
  });

  it('leaves views outside it alone', async () => {
    await mountTree(() => (
      <view>
        <LayoutAnimationConfig skipEntering />
        <view entering={fade} />
      </view>
    ));

    expect(enteringSent()).toBe(true);
  });
});
