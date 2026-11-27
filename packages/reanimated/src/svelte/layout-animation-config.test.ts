import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutAnimationType } from 'react-native-reanimated/src/commonTypes';
import { updateLayoutAnimations } from 'react-native-reanimated/src/UpdateLayoutAnimations';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { mountSvelte } from '../../test-support/mount-svelte';
import Fixture from './layout-animation-config.fixture.svelte';
import '../register';

vi.mock('react-native-reanimated/src/UpdateLayoutAnimations', () => ({
  updateLayoutAnimations: vi.fn(),
}));

installWrapperHost();
const ROOT_TAG = 19_601;
const update = vi.mocked(updateLayoutAnimations);
let unmountTree = () => {};

beforeEach(() => update.mockClear());
afterEach(() => unmountTree());

function enteringSent(): boolean {
  return update.mock.calls.some(([, type]) => {
    return type === LayoutAnimationType.ENTERING;
  });
}

async function mountTree(props: object) {
  unmountTree = await mountSvelte(ROOT_TAG, Fixture, props);
}

describe('LayoutAnimationConfig', () => {
  it('skips the entering animation of the views under it when they mount with it', async () => {
    await mountTree({ skipEntering: true });

    expect(update).not.toHaveBeenCalledWith(
      expect.any(Number),
      LayoutAnimationType.ENTERING,
      expect.anything(),
    );
    expect(enteringSent()).toBe(false);
  });

  it('lets the views under it animate in when it does not skip', async () => {
    await mountTree({ skipEntering: false });

    expect(enteringSent()).toBe(true);
  });

  it('skips a view nested under other views, not only its own children', async () => {
    await mountTree({ skipEntering: true, nested: true });

    expect(enteringSent()).toBe(false);
  });

  it('leaves views outside it alone', async () => {
    await mountTree({ skipEntering: true, outside: true });

    expect(enteringSent()).toBe(true);
  });
});
