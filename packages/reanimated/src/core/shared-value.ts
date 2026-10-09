import { cancelAnimation } from 'react-native-reanimated/src/animation';
import type { SharedValue } from 'react-native-reanimated/src/commonTypes';
import { makeMutable } from 'react-native-reanimated/src/core';

export type ISharedValueController<Value> = {
  shared: SharedValue<Value>;
  // Stops the animation the value may still be running, which is all `useSharedValue` cleans up
  dispose: () => void;
};

function isInitializer<Value>(
  initial: Value | (() => Value),
): initial is () => Value {
  return typeof initial === 'function';
}

// A function initial value is called once, never stored: a shared value does not hold functions
export function createSharedValue<Value>(
  initialValue: Value | (() => Value),
): ISharedValueController<Value> {
  const initial = isInitializer(initialValue) ? initialValue() : initialValue;
  const shared = makeMutable(initial);
  return { shared, dispose: () => cancelAnimation(shared) };
}
