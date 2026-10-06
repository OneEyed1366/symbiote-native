// InputAccessoryView off iOS, against RN's InputAccessoryView.js:110-113: it warns and renders
// nothing. The render half is the void component (component-names/index.android.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendChild,
  clearHostBehaviors,
  createElement,
  createSurface,
  Dimensions,
  Platform,
} from '@symbiote-native/engine';

import {
  createLiveTree,
  installRecordingFabric,
  seedWindowDimensions,
  TEST_WINDOW,
  type ILiveNode,
} from '../../../test-utils/src/index';
import {
  INPUT_ACCESSORY_VIEW_TAG,
  registerInputAccessoryViewBehavior,
} from './input-accessory-view';

const fabric = installRecordingFabric();
const originalOs = Platform.OS;

function setOs(os: string): void {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  seedWindowDimensions();
  registerInputAccessoryViewBehavior();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  setOs(originalOs);
  warn.mockRestore();
  clearHostBehaviors();
});

describe('input-accessory-view platform support (Positive — no throwing path)', () => {
  // why: RN tells the developer the component does nothing on this platform.
  it('warns that it is iOS-only when created on Android', () => {
    setOs('android');
    createElement('RCTView', false, INPUT_ACCESSORY_VIEW_TAG);
    expect(warn).toHaveBeenCalledWith(
      '<InputAccessoryView> is only supported on iOS.',
    );
  });

  // why: on iOS it is a real native view; nothing to warn about.
  it('stays silent on iOS', () => {
    setOs('ios');
    createElement('RCTInputAccessoryView', false, INPUT_ACCESSORY_VIEW_TAG);
    expect(warn).not.toHaveBeenCalled();
  });
});

// RN wraps the children in a SafeAreaView sized to the window (`InputAccessoryView.js:97-99`)
describe('input-accessory-view content wrapper', () => {
  const WINDOW = TEST_WINDOW;
  const live = createLiveTree(fabric);
  let nextRootTag = 8_800;

  function mountWithChild(): {
    accessory: () => ILiveNode;
    commit: () => void;
  } {
    const surface = createSurface((nextRootTag += 1));
    const root = createElement('RCTView');
    surface.appendChild(root);
    const accessory = createElement(
      'RCTInputAccessoryView',
      false,
      INPUT_ACCESSORY_VIEW_TAG,
    );
    appendChild(accessory, createElement('RCTText'));
    appendChild(root, accessory);
    surface.commit();
    return {
      commit: () => surface.commit(),
      accessory: () => {
        const mounted = live.nodeOf(root).children[0];
        if (mounted === undefined) throw new Error('nothing committed');
        return mounted;
      },
    };
  }

  beforeEach(() => {
    fabric.reset();
    setOs('ios');
  });

  // The content fills the accessory at the full window width instead of shrinking to its text
  it('nests the children in a safe area view that is flex 1 and window wide', () => {
    const { accessory } = mountWithChild();

    expect(accessory().children.map(child => child.viewName)).toEqual([
      'SafeAreaView',
    ]);
    const wrapper = accessory().children[0];
    expect(wrapper.payload.flex).toBe(1);
    expect(wrapper.payload.width).toBe(WINDOW.width);
    expect(wrapper.children.map(child => child.viewName)).toEqual(['RCTText']);
  });

  // RN reads `useWindowDimensions`, so a rotation re-sizes the wrapper
  it('follows the window width when it changes', () => {
    const { accessory, commit } = mountWithChild();

    Dimensions.set({ window: { ...WINDOW, width: 844 }, screen: WINDOW });
    commit();

    expect(accessory().children[0].payload.width).toBe(844);
  });
});
