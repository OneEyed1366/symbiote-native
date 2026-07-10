// Drawer option types + the pure swipe/geometry math. Framework-agnostic (numbers and
// booleans only, per CLAUDE.md <prop_types_split_agnostic_vs_per_adapter>), shared verbatim by
// every adapter. Mirrors react-navigation's Drawer prop surface (confirmed against the current
// @react-navigation/drawer docs): drawerType 'front'/'back'/'slide'/'permanent', drawerPosition,
// drawerWidth, overlayColor, swipeEnabled + the three swipe-tuning knobs. What is NOT ported:
// `configureGestureHandler` — a react-native-gesture-handler-specific escape hatch with no
// PanResponder equivalent (see packages/navigation's README / the drawer feasibility note for the
// full gap list).

import type { IPanResponderGestureState } from '@symbiote-native/engine';

export type IDrawerType = 'front' | 'back' | 'slide' | 'permanent';
export type IDrawerPosition = 'left' | 'right';

export interface IDrawerOptions {
  drawerType?: IDrawerType;
  drawerPosition?: IDrawerPosition;
  drawerWidth?: number;
  overlayColor?: string;
  swipeEnabled?: boolean;
  // How far from the position edge a closed-drawer swipe must START to count (react-navigation
  // default: 32).
  swipeEdgeWidth?: number;
  // Minimum accumulated drag distance to snap-open/close on release (react-navigation default: 60).
  swipeMinDistance?: number;
  // Minimum release velocity (px/ms, same unit as gestureState.vx) that snaps regardless of
  // distance (react-navigation default: 500 px/s == 0.5 px/ms).
  swipeMinVelocity?: number;
}

// Per-screen options a caller's own renderDrawerContent reads to label its menu entries — the
// drawer navigator has no built-in menu UI (matching react-native-drawer-layout's Drawer
// primitive, which the underlying @react-navigation/drawer itself builds its DrawerItemList on
// top of), so this stays deliberately small next to IScreenOptions's header surface.
export interface IDrawerScreenOptions {
  title?: string;
  drawerLabel?: string;
}

export const DRAWER_DEFAULT_TYPE: IDrawerType = 'front';
export const DRAWER_DEFAULT_POSITION: IDrawerPosition = 'left';
export const DRAWER_DEFAULT_WIDTH = 280;
export const DRAWER_DEFAULT_OVERLAY_COLOR = 'rgba(0, 0, 0, 0.5)';
export const DRAWER_DEFAULT_SWIPE_ENABLED = true;
export const DRAWER_DEFAULT_SWIPE_EDGE_WIDTH = 32;
export const DRAWER_DEFAULT_SWIPE_MIN_DISTANCE = 60;
// react-navigation's 500 is px/second; gestureState.vx is px/ms, so the default converts.
export const DRAWER_DEFAULT_SWIPE_MIN_VELOCITY = 0.5;

// Exported so render-drawer.ts and the adapter can resolve the same defaults without
// re-declaring the `??` fallback (a second copy would drift the instant a default changes).
export function resolveDrawerWidth(options: IDrawerOptions): number {
  return options.drawerWidth ?? DRAWER_DEFAULT_WIDTH;
}

export function resolveDrawerType(options: IDrawerOptions): IDrawerType {
  return options.drawerType ?? DRAWER_DEFAULT_TYPE;
}

export function resolveDrawerPosition(options: IDrawerOptions): IDrawerPosition {
  return options.drawerPosition ?? DRAWER_DEFAULT_POSITION;
}

// The animated outputs a progress value of 0 (closed) -> 1 (open) drives, resolved once per
// drawerType/position/width combination. 'permanent' never animates (no gesture, no snap), so
// callers short-circuit on isDrawerAnimated before reading this.
export type IDrawerGeometry = {
  panelTranslateXClosed: number;
  panelTranslateXOpen: number;
  contentTranslateXClosed: number;
  contentTranslateXOpen: number;
  overlayOpacityClosed: number;
  overlayOpacityOpen: number;
};

export function isDrawerAnimated(options: IDrawerOptions): boolean {
  return resolveDrawerType(options) !== 'permanent';
}

export function isDrawerOverlayVisible(options: IDrawerOptions): boolean {
  const type = resolveDrawerType(options);
  return type === 'front' || type === 'slide';
}

// front: only the panel moves (-width -> 0), content stays put, overlay fades in.
// back: only the content moves, away from the position edge, to reveal the stationary panel;
//   no overlay (the panel sits fully behind the content, nothing to dim).
// slide: panel AND content move together by the same delta, overlay fades in (content still
//   covers the panel partially as they slide in tandem, same as front visually at rest).
// permanent: static, all zero (isDrawerAnimated() gates callers off this path already).
export function resolveDrawerGeometry(options: IDrawerOptions): IDrawerGeometry {
  const width = resolveDrawerWidth(options);
  const type = resolveDrawerType(options);
  const sign = resolveDrawerPosition(options) === 'left' ? 1 : -1;
  const closedPanelX = -sign * width;
  const openContentX = sign * width;

  switch (type) {
    case 'back':
      return {
        panelTranslateXClosed: 0,
        panelTranslateXOpen: 0,
        contentTranslateXClosed: 0,
        contentTranslateXOpen: openContentX,
        overlayOpacityClosed: 0,
        overlayOpacityOpen: 0,
      };
    case 'slide':
      return {
        panelTranslateXClosed: closedPanelX,
        panelTranslateXOpen: 0,
        contentTranslateXClosed: 0,
        contentTranslateXOpen: openContentX,
        overlayOpacityClosed: 0,
        overlayOpacityOpen: 1,
      };
    case 'front':
    case 'permanent':
    default:
      return {
        panelTranslateXClosed: closedPanelX,
        panelTranslateXOpen: 0,
        contentTranslateXClosed: 0,
        contentTranslateXOpen: 0,
        overlayOpacityClosed: 0,
        overlayOpacityOpen: 1,
      };
  }
}

// onStartShouldSetPanResponder gate: while closed, a swipe must START within swipeEdgeWidth of
// the drawer's position edge (mirrors react-navigation's swipeEdgeWidth). While open, the whole
// content + overlay area is fair game to drag-close, matching the intuitive "swipe anywhere to
// dismiss an open drawer" behavior every drawer implementation (including RN's dropped native
// DrawerLayoutAndroid) shares.
export function isSwipeStartInEdge(
  startX: number,
  screenWidth: number,
  isOpen: boolean,
  options: IDrawerOptions,
): boolean {
  if (isOpen) return true;
  const edgeWidth = options.swipeEdgeWidth ?? DRAWER_DEFAULT_SWIPE_EDGE_WIDTH;
  return resolveDrawerPosition(options) === 'left'
    ? startX <= edgeWidth
    : startX >= screenWidth - edgeWidth;
}

// onMoveShouldSetPanResponder gate: only claim the gesture once it reads as a horizontal drag
// (RN's own PanResponder examples use this exact dominant-axis check to stay out of a vertical
// ScrollView's way).
const MOVE_CLAIM_THRESHOLD = 5;

export function isHorizontalDrag(gestureState: IPanResponderGestureState): boolean {
  return (
    Math.abs(gestureState.dx) > MOVE_CLAIM_THRESHOLD &&
    Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
  );
}

export type ISwipeIntent = 'open' | 'close';

// The release-time decision, structurally the same shape as switch.ts's shouldSnapBack: a pure
// predicate over the accumulated gesture plus the option thresholds, no framework. Distance OR
// velocity past its threshold, in the direction that would move the drawer toward the opposite
// of its current state, snaps it there; anything else snaps back to where it started.
export function resolveSwipeIntent(
  gestureState: IPanResponderGestureState,
  isOpen: boolean,
  options: IDrawerOptions,
): ISwipeIntent {
  const sign = resolveDrawerPosition(options) === 'left' ? 1 : -1;
  // Positive `signedDelta` means "dragging toward open" for a left drawer's rightward drag (and
  // symmetrically for a right drawer's leftward drag).
  const signedDx = sign * gestureState.dx;
  const signedVx = sign * gestureState.vx;
  const minDistance = options.swipeMinDistance ?? DRAWER_DEFAULT_SWIPE_MIN_DISTANCE;
  const minVelocity = options.swipeMinVelocity ?? DRAWER_DEFAULT_SWIPE_MIN_VELOCITY;

  const pastDistance = Math.abs(signedDx) >= minDistance;
  const pastVelocity = Math.abs(signedVx) >= minVelocity;
  if (!pastDistance && !pastVelocity) return isOpen ? 'open' : 'close';

  // Velocity wins the direction call when it clears its own threshold (a fast flick can reverse
  // a short drag); otherwise the drag distance's sign decides.
  const towardOpen = pastVelocity ? signedVx > 0 : signedDx > 0;
  return towardOpen ? 'open' : 'close';
}
