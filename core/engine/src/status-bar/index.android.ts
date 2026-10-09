// StatusBar on Android: single-arg `setStyle` / `setHidden` plus `setColor` / `setTranslucent`
// (RN's `NativeStatusBarManagerAndroid`), Metro picks this file on an Android host

import { getNativeModule } from '../native-modules';
import { dlog } from '../debug';
import { processColor, type IColorValue } from '../platform-color';
import {
  STATUS_BAR_MANAGER,
  type IStatusBarController,
  type IStatusBarMerged,
} from './shared';
import { createStatusBarStack } from './stack';
export type { IStatusBarProps, IStatusBarStyle } from './shared';

// Only the setters we call, the single point that accepts the native shape
type INativeStatusBarManagerAndroid = {
  setHidden(hidden: boolean): void;
  setStyle(statusBarStyle?: string): void;
  setColor(color: number, animated: boolean): void;
  setTranslucent(translucent: boolean): void;
  getConstants?(): {
    HEIGHT?: number;
    DEFAULT_BACKGROUND_COLOR?: IColorValue;
  };
};

// A color that parses to nothing warns like RN, one that is not an int is dropped, headless
// `processColor` hands a string back
function sendColor(
  manager: INativeStatusBarManagerAndroid,
  color: IColorValue,
  animated: boolean,
  origin: string,
): void {
  const processed = processColor(color);
  if (processed == null) {
    console.warn(
      `${origin}: Color ${String(color)} parsed to null or undefined`,
    );
    return;
  }
  if (typeof processed !== 'number') {
    dlog(`StatusBar android: ${String(color)} did not process to an int`);
    return;
  }
  manager.setColor(processed, animated);
}

// `resolve` is read on every call, a declarative StatusBar must not crash a render when the module
// is missing
export function createAndroidStatusBar(
  resolve: () => INativeStatusBarManagerAndroid | null,
): IStatusBarController {
  function createDefaults(): IStatusBarMerged {
    return {
      backgroundColor: {
        value: resolve()?.getConstants?.().DEFAULT_BACKGROUND_COLOR ?? 'black',
        animated: false,
      },
      barStyle: { value: 'default', animated: false },
      translucent: false,
      hidden: { value: false, animated: false, transition: 'fade' },
      networkActivityIndicatorVisible: false,
    };
  }

  const stack = createStatusBarStack({
    createDefaults,
    flush(previous, merged) {
      const manager = resolve();
      if (manager === null) {
        dlog('StatusBar android: StatusBarManager not resolvable, skipping');
        return;
      }
      // RN does not skip an unchanged style or color on Android
      manager.setStyle(merged.barStyle.value);
      sendColor(
        manager,
        merged.backgroundColor.value,
        merged.backgroundColor.animated,
        '`StatusBar._updatePropsStack`',
      );
      if (previous === null || previous.hidden.value !== merged.hidden.value) {
        manager.setHidden(merged.hidden.value);
      }
      // Activities are not translucent by default, so a true value is always sent
      if (
        previous === null ||
        previous.translucent !== merged.translucent ||
        merged.translucent
      ) {
        manager.setTranslucent(merged.translucent);
      }
    },
  });

  return {
    createEntry: stack.createEntry,
    currentHeight: () => resolve()?.getConstants?.().HEIGHT,
    imperative: {
      setBarStyle(style) {
        stack.getDefaults().barStyle.value = style;
        resolve()?.setStyle(style);
      },
      setHidden(hidden) {
        stack.getDefaults().hidden.value = hidden;
        resolve()?.setHidden(hidden);
      },
      setNetworkActivityIndicatorVisible() {
        console.warn(
          '`setNetworkActivityIndicatorVisible` is only available on iOS',
        );
      },
      setBackgroundColor(color, animated = false) {
        stack.getDefaults().backgroundColor.value = color;
        const manager = resolve();
        if (manager !== null) {
          sendColor(manager, color, animated, '`StatusBar.setBackgroundColor`');
        }
      },
      setTranslucent(translucent) {
        stack.getDefaults().translucent = translucent;
        resolve()?.setTranslucent(translucent);
      },
      pushStackEntry: stack.push,
      popStackEntry: stack.pop,
      replaceStackEntry: stack.replace,
    },
  };
}

const controller = createAndroidStatusBar(() =>
  getNativeModule<INativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER),
);

export const createStatusBarEntry = controller.createEntry;
export const statusBarImperative = controller.imperative;
export const statusBarCurrentHeight = controller.currentHeight;
