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

function enteringCancelled(): boolean {
  return update.mock.calls.some(([, type, config]) => {
    return type === LayoutAnimationType.ENTERING && config === undefined;
  });
}

async function mountTree(props: object) {
  unmountTree = await mountSvelte(ROOT_TAG, Fixture, props);
}

describe('LayoutAnimationConfig', () => {
  it('skips the entering animation of the views under it when they mount with it', async () => {
    await mountTree({ skipEntering: true });

    expect(update).toHaveBeenCalledWith(
      expect.any(Number),
      LayoutAnimationType.ENTERING,
      undefined,
    );
    expect(enteringCancelled()).toBe(true);
  });

  it('lets the views under it animate in when it does not skip', async () => {
    await mountTree({ skipEntering: false });

    expect(enteringCancelled()).toBe(false);
  });

  it('skips a view nested under other views, not only its own children', async () => {
    await mountTree({ skipEntering: true, nested: true });

    expect(enteringCancelled()).toBe(true);
  });

  it('leaves views outside it alone', async () => {
    await mountTree({ skipEntering: true, outside: true });

    expect(enteringCancelled()).toBe(false);
  });
});
