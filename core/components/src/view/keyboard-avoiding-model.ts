// What RN's KeyboardAvoidingView holds in instance fields (`_frame`, `_keyboardEvent`,
// `_initialFrameHeight`, `_bottom`) and the rules that move them, once for every adapter
// An adapter only subscribes to the keyboard, forwards the wrapper's layout and renders the inset

import type {
  ILayoutAnimationConfig,
  IPlatformOSType,
} from '@symbiote-native/engine';
import {
  computeInset,
  configureKeyboardAvoidingAnimation,
  readKeyboardAnimationTiming,
  readKeyboardFrame,
  readLayoutFrame,
  type IKeyboardAvoidingBehavior,
  type IMeasuredFrame,
} from './render-keyboard-avoiding-view';

export type IKeyboardAvoidingModelOptions = {
  behavior?: IKeyboardAvoidingBehavior;
  enabled: boolean;
  keyboardVerticalOffset: number;
};

export type IKeyboardAvoidingModelHost = {
  // Read on every event, a prop may have changed since the model was made
  options: () => IKeyboardAvoidingModelOptions;
  // Called while the view is disabled too, so a re-enable shows the current inset
  setInset: (inset: number) => void;
  prefersCrossFade: () => boolean;
  animate?: (config: ILayoutAnimationConfig) => void;
  os?: IPlatformOSType;
};

export type IKeyboardAvoidingModel = {
  keyboardShown: (payload: unknown) => void;
  keyboardHidden: () => void;
  // The wrapper's `nativeEvent.layout`
  laidOut: (layout: unknown) => void;
  initialHeight: () => number | undefined;
};

export function createKeyboardAvoidingModel(
  host: IKeyboardAvoidingModelHost,
): IKeyboardAvoidingModel {
  let frame: IMeasuredFrame | undefined;
  let keyboardEvent: unknown;
  let firstHeight: number | undefined;
  let bottom = 0;
  // RN's `state.bottom`: only an enabled view renders a new value, `height` adds it back
  let rendered = 0;

  const setBottom = (value: number, enabled: boolean): void => {
    bottom = value;
    if (enabled) rendered = value;
    host.setInset(value);
  };

  // RN's `_updateBottomIfNecessary`
  const update = (): void => {
    const { behavior, enabled, keyboardVerticalOffset } = host.options();
    if (keyboardEvent === undefined) {
      setBottom(0, enabled);
      return;
    }
    // RN's `componentDidUpdate` catches the rendered value up once the view is enabled again
    if (enabled) rendered = bottom;
    const height = computeInset(
      frame,
      readKeyboardFrame(keyboardEvent),
      keyboardVerticalOffset,
      {
        behavior,
        previousInset: rendered,
        prefersCrossFadeTransitions: host.prefersCrossFade(),
        os: host.os,
      },
    );
    if (bottom === height) return;
    setBottom(height, enabled);
    configureKeyboardAvoidingAnimation(
      readKeyboardAnimationTiming(keyboardEvent),
      enabled,
      host.animate,
    );
  };

  return {
    keyboardShown: payload => {
      keyboardEvent = payload;
      update();
    },
    keyboardHidden: () => {
      keyboardEvent = undefined;
      update();
    },
    laidOut: layout => {
      const next = readLayoutFrame(layout);
      if (next === undefined) return;
      const previous = frame;
      frame = next;
      // RN treats a height of 0 as "not saved yet"
      if (!firstHeight) firstHeight = next.height;
      if (previous === undefined || previous.height !== next.height) update();
    },
    initialHeight: () => firstHeight,
  };
}
