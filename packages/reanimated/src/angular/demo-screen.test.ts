import '@angular/compiler';
import { createLiveTree } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubCancelAnimationFrame } from '../../test-support/cancel-animation-frame';
import {
  describeDemoScreen,
  SECTION_TITLES,
} from '../../test-support/demo-screen-suite';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { settle } from '../../test-support/worklet';
import { ReanimatedScreen } from '../../../../examples/angular/src/screens/ReanimatedScreen';
import '../register';

// The screen examples/angular shows, mounted over the package as an app would: whatever throws on a
// device at render time throws here first
const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 17_951;

vi.mock('react-native-reanimated/src/updateProps', () => ({
  updateProps: vi.fn(),
}));

beforeEach(() => {
  host.fabric.reset();
  stubCancelAnimationFrame();
  vi.useFakeTimers();
});

afterEach(() => {
  unmount(ROOT_TAG);
  vi.useRealTimers();
});

async function mountScreen() {
  mount(ROOT_TAG, ReanimatedScreen);
  await vi.advanceTimersByTimeAsync(0);
  await settle();
  return live.appRoot();
}

describeDemoScreen('Angular', {
  host,
  live,
  mountScreen,
  flush: settle,
});

describe('the Angular Reanimated demo screen, mounted', () => {
  it('renders every section it names', async () => {
    const root = await mountScreen();

    expect(live.texts(root)).toEqual(
      expect.arrayContaining([...SECTION_TITLES]),
    );
  });

  it('commits the scroll section view with nested scrolling on, for Android', async () => {
    await mountScreen();

    const [view] = host.fabric.findAll(
      node => node.props.testID === 'ra-scroll-view',
    );

    expect(view?.props.nestedScrollEnabled).toBe(true);
  });

  it('survives a second of frames with every section mounted', async () => {
    await mountScreen();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(host.fabric.findAll(() => true).length).toBeGreaterThan(0);
  });
});
