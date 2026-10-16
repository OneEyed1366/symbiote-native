// StatusBar is the React-side contract. Types, the imperative API and the props stack live in
// @symbiote-native/engine, React supplies the declarative component: an FC that renders null and
// keeps one stack entry for as long as it is mounted

import { useEffect, useState, type FC } from 'react';
import {
  createStatusBarEntry,
  type IStatusBarImperative,
  type IStatusBarProps,
} from '@symbiote-native/engine';
export type {
  IStatusBarProps,
  IStatusBarStyle,
  IStatusBarAnimation,
} from '@symbiote-native/engine';

// `currentHeight` is Android-only, on iOS it is absent (RN sets it to null)
export type IStatusBarComponent = FC<IStatusBarProps> &
  IStatusBarImperative & { currentHeight?: number };

// Every field is a dependency, the engine ignores the ones its platform has no use for
export const StatusBarComponent: FC<IStatusBarProps> = props => {
  const {
    barStyle,
    hidden,
    animated,
    showHideTransition,
    networkActivityIndicatorVisible,
    backgroundColor,
    translucent,
  } = props;
  const [entry] = useState(createStatusBarEntry);

  useEffect(() => {
    entry.apply({
      barStyle,
      hidden,
      animated,
      showHideTransition,
      networkActivityIndicatorVisible,
      backgroundColor,
      translucent,
    });
  }, [
    entry,
    barStyle,
    hidden,
    animated,
    showHideTransition,
    networkActivityIndicatorVisible,
    backgroundColor,
    translucent,
  ]);

  // Popping on unmount restores what the stack held below this entry
  useEffect(() => () => entry.release(), [entry]);

  return null;
};
