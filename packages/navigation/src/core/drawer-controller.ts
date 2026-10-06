// Imperative half of the drawer, shared by every adapter: `progress`, the snap animation, the
// handle and the swipe responder. An adapter passes readers over its own state and its own
// `Animated`, which turns into a mock when the host reports reduced motion

import { PanResponder, dlog } from '@symbiote-native/engine';
import type {
  AnimatedValue,
  IPanResponderGestureState,
  ISymbioteEvent,
} from '@symbiote-native/engine';
import {
  resolveDragProgress,
  resolveSwipeIntent,
  shouldClaimDrawerSwipe,
} from './drawer-options';
import type { IDrawerOptions } from './drawer-options';
import { drawerRouterReducer } from './drawer-router-state';
import type {
  IDrawerRouterAction,
  IDrawerRouterState,
} from './drawer-router-state';
import type { IDrawerNavigatorHandle } from './navigator-handles';

const DRAWER_SNAP_DURATION = 250;

const SWIPE_INTENT_OPEN: ReturnType<typeof resolveSwipeIntent> = 'open';

// The part of the adapter's `Animated` the controller needs
export type IDrawerAnimated = {
  Value: new (initial: number) => AnimatedValue;
  timing: (
    value: AnimatedValue,
    config: { toValue: number; duration: number; useNativeDriver: boolean },
  ) => { start: () => void };
};

export type IDrawerControllerInput = {
  animated: IDrawerAnimated;
  readState: () => IDrawerRouterState;
  dispatch: (action: IDrawerRouterAction) => void;
  readOptions: () => IDrawerOptions;
  readWindowWidth: () => number;
};

type IClaimPhase = Parameters<typeof shouldClaimDrawerSwipe>[5];

type IDrawerMotion = {
  readState: () => IDrawerRouterState;
  dispatch: (action: IDrawerRouterAction) => void;
  animateProgressTo: (isOpen: boolean) => void;
};

function createHandle({
  readState,
  dispatch,
  animateProgressTo,
}: IDrawerMotion): IDrawerNavigatorHandle {
  const setOpen = (isOpen: boolean): void => {
    animateProgressTo(isOpen);
    dispatch({ type: isOpen ? 'openDrawer' : 'closeDrawer' });
  };
  return {
    openDrawer: () => setOpen(true),
    closeDrawer: () => setOpen(false),
    toggleDrawer: () => {
      animateProgressTo(!readState().isOpen);
      dispatch({ type: 'toggleDrawer' });
    },
    jumpTo: name => {
      // An unregistered name is a reducer no-op that returns the SAME state, so animating off
      // `isOpen` alone would slide the panel shut while the router still says open. The reducer is
      // pure, so re-running it tells what the dispatch yields before an async dispatch lands
      const action: IDrawerRouterAction = { type: 'jumpTo', name };
      const current = readState();
      const next = drawerRouterReducer(current, action);
      dispatch(action);
      if (current.isOpen && !next.isOpen) animateProgressTo(false);
    },
  };
}

function createPanResponder(
  input: IDrawerControllerInput & IDrawerMotion,
  progress: AnimatedValue,
) {
  const { readState, dispatch, readOptions, readWindowWidth } = input;
  // Where a drag starts, always 0 or 1: a gesture only begins at rest, since release and
  // terminate snap back before another grant can fire
  let dragStartProgress = 0;

  const claim =
    (phase: IClaimPhase) =>
    (event: ISymbioteEvent, gestureState: IPanResponderGestureState): boolean =>
      shouldClaimDrawerSwipe(
        event,
        gestureState,
        readWindowWidth(),
        readState().isOpen,
        readOptions(),
        phase,
      );

  return PanResponder.create({
    onStartShouldSetPanResponder: claim('start'),
    onMoveShouldSetPanResponder: claim('move'),
    onPanResponderGrant: (): void => {
      dlog('Drawer: gesture grant');
      dragStartProgress = readState().isOpen ? 1 : 0;
    },
    onPanResponderMove: (_event, gestureState): void => {
      progress.setValue(
        resolveDragProgress(gestureState, dragStartProgress, readOptions()),
      );
    },
    onPanResponderRelease: (_event, gestureState): void => {
      const intent = resolveSwipeIntent(
        gestureState,
        readState().isOpen,
        readOptions(),
      );
      const isOpen = intent === SWIPE_INTENT_OPEN;
      dlog(`Drawer: gesture release -> ${intent}`);
      input.animateProgressTo(isOpen);
      dispatch({ type: isOpen ? 'openDrawer' : 'closeDrawer' });
    },
    onPanResponderTerminate: (): void => {
      dlog('Drawer: gesture terminated, snapping back');
      input.animateProgressTo(readState().isOpen);
    },
  });
}

export function createDrawerController(input: IDrawerControllerInput) {
  const { animated, readState } = input;
  // 0 closed -> 1 open, the one value every slide and opacity transform interpolates from
  const progress = new animated.Value(readState().isOpen ? 1 : 0);

  // Every imperative caller funnels through here, so this log shows whether a snap really started
  function animateProgressTo(isOpen: boolean): void {
    dlog(`Drawer: animateProgressTo(open=${isOpen}) at t=${Date.now()}`);
    animated
      .timing(progress, {
        toValue: isOpen ? 1 : 0,
        duration: DRAWER_SNAP_DURATION,
        useNativeDriver: false,
      })
      .start();
  }

  const motion = { ...input, animateProgressTo };
  return {
    progress,
    animateProgressTo,
    handle: createHandle(motion),
    panResponder: createPanResponder(motion, progress),
  };
}
