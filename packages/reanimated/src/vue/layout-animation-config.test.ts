import { mount, unmount } from '@symbiote-native/vue';
import { h, nextTick } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutAnimationType } from 'react-native-reanimated/src/commonTypes';
import { updateLayoutAnimations } from 'react-native-reanimated/src/UpdateLayoutAnimations';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { View } from './animated';
import { LayoutAnimationConfig } from './layout-animation-config';
import '../register';

vi.mock('react-native-reanimated/src/UpdateLayoutAnimations', () => ({
  updateLayoutAnimations: vi.fn(),
}));

installWrapperHost();
const ROOT_TAG = 19_501;
const update = vi.mocked(updateLayoutAnimations);

beforeEach(() => update.mockClear());
afterEach(() => unmount(ROOT_TAG));

const fade = () => ({ animations: {}, initialValues: {}, callback: undefined });

function enteringCancelled(): boolean {
  return update.mock.calls.some(([, type, config]) => {
    return type === LayoutAnimationType.ENTERING && config === undefined;
  });
}

async function mountTree(tree: ReturnType<typeof h>) {
  mount(ROOT_TAG, { render: () => tree });
  await nextTick();
}

describe('LayoutAnimationConfig', () => {
  it('skips the entering animation of the views under it when they mount with it', async () => {
    await mountTree(
      h(LayoutAnimationConfig, { skipEntering: true }, () =>
        h(View, { entering: fade }),
      ),
    );

    expect(enteringCancelled()).toBe(true);
  });

  it('lets the views under it animate in when it does not skip', async () => {
    await mountTree(
      h(LayoutAnimationConfig, { skipEntering: false }, () =>
        h(View, { entering: fade }),
      ),
    );

    expect(enteringCancelled()).toBe(false);
  });

  it('skips a view nested under other views, not only its own children', async () => {
    await mountTree(
      h(LayoutAnimationConfig, { skipEntering: true }, () =>
        h('view', null, [h('view', null, [h(View, { entering: fade })])]),
      ),
    );

    expect(enteringCancelled()).toBe(true);
  });

  it('leaves views outside it alone', async () => {
    await mountTree(
      h('view', null, [
        h(LayoutAnimationConfig, { skipEntering: true }),
        h(View, { entering: fade }),
      ]),
    );

    expect(enteringCancelled()).toBe(false);
  });
});
