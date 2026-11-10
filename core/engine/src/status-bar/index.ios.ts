// StatusBar on iOS: the iOS `StatusBarManager` takes `setStyle(style, animated)` and
// `setHidden(hidden, withAnimation)`, per RN's `NativeStatusBarManagerIOS`
// Metro picks this file on an iOS host, the base `index.ts` re-exports it for tsc and headless

import { getNativeModule } from '../native-modules';
import { dlog } from '../debug';
import {
  STATIC_HIDE_TRANSITION,
  STATUS_BAR_MANAGER,
  type IStatusBarAnimation,
  type IStatusBarController,
  type IStatusBarMerged,
  type IStatusBarStyle,
} from './shared';
import { createStatusBarStack } from './stack';
export type { IStatusBarProps, IStatusBarStyle } from './shared';

// Only the setters we call, the single point that accepts the native shape
type INativeStatusBarManager = {
  setStyle(statusBarStyle: IStatusBarStyle, animated: boolean): void;
  setHidden(hidden: boolean, withAnimation: IStatusBarAnimation): void;
  setNetworkActivityIndicatorVisible(visible: boolean): void;
};

function createDefaults(): IStatusBarMerged {
  return {
    backgroundColor: { value: 'black', animated: false },
    barStyle: { value: 'default', animated: false },
    translucent: false,
    hidden: { value: false, animated: false, transition: 'fade' },
    networkActivityIndicatorVisible: false,
  };
}

// `resolve` is read on every call, a declarative StatusBar must not crash a render when the module
// is missing
export function createIosStatusBar(
  resolve: () => INativeStatusBarManager | null,
): IStatusBarController {
  const stack = createStatusBarStack({
    createDefaults,
    flush(previous, merged) {
      const manager = resolve();
      if (manager === null) {
        dlog('StatusBar: StatusBarManager not resolvable, skipping');
        return;
      }
      if (
        previous === null ||
        previous.barStyle.value !== merged.barStyle.value
      ) {
        manager.setStyle(merged.barStyle.value, merged.barStyle.animated);
      }
      if (previous === null || previous.hidden.value !== merged.hidden.value) {
        manager.setHidden(
          merged.hidden.value,
          merged.hidden.animated ? merged.hidden.transition : 'none',
        );
      }
      if (
        previous === null ||
        previous.networkActivityIndicatorVisible !==
          merged.networkActivityIndicatorVisible
      ) {
        manager.setNetworkActivityIndicatorVisible(
          merged.networkActivityIndicatorVisible,
        );
      }
    },
  });

  return {
    createEntry: stack.createEntry,
    // RN reports no height off Android
    currentHeight: () => undefined,
    imperative: {
      setBarStyle(style, animated = false) {
        stack.getDefaults().barStyle.value = style;
        resolve()?.setStyle(style, animated);
      },
      setHidden(hidden, animation = STATIC_HIDE_TRANSITION) {
        stack.getDefaults().hidden.value = hidden;
        resolve()?.setHidden(hidden, animation);
      },
      setNetworkActivityIndicatorVisible(visible) {
        stack.getDefaults().networkActivityIndicatorVisible = visible;
        resolve()?.setNetworkActivityIndicatorVisible(visible);
      },
      setBackgroundColor() {
        console.warn('`setBackgroundColor` is only available on Android');
      },
      setTranslucent() {
        console.warn('`setTranslucent` is only available on Android');
      },
      pushStackEntry: stack.push,
      popStackEntry: stack.pop,
      replaceStackEntry: stack.replace,
    },
  };
}

const controller = createIosStatusBar(() =>
  getNativeModule<INativeStatusBarManager>(STATUS_BAR_MANAGER),
);

export const createStatusBarEntry = controller.createEntry;
export const statusBarImperative = controller.imperative;
export const statusBarCurrentHeight = controller.currentHeight;
