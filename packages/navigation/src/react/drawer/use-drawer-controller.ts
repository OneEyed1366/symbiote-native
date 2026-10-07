// The shared drawer controller, built once and reading React's per-render values through refs

import { useRef, useState } from 'react';
import type { Dispatch } from 'react';
import { Animated, useWindowDimensions } from '@symbiote-native/react';
import { createDrawerController } from '../../core';
import type {
  IDrawerOptions,
  IDrawerRouterAction,
  IDrawerRouterState,
} from '../../core';

// Built once, as PanResponder handlers recreated mid-gesture would drop the in-flight touch
// The refs are refreshed on every render, so its callbacks still read the CURRENT values
export function useDrawerController(
  state: IDrawerRouterState,
  dispatch: Dispatch<IDrawerRouterAction>,
  options: IDrawerOptions,
) {
  const { width } = useWindowDimensions();
  const stateRef = useRef(state);
  stateRef.current = state;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const widthRef = useRef(width);
  widthRef.current = width;
  const [controller] = useState(() =>
    createDrawerController({
      animated: Animated,
      readState: () => stateRef.current,
      dispatch,
      readOptions: () => optionsRef.current,
      readWindowWidth: () => widthRef.current,
    }),
  );
  return controller;
}
