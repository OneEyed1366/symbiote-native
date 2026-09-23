// Modal logic, framework-agnostic. On iOS RN keeps the modal mounted through its exit animation
// until native onDismiss arrives (Modal.js _shouldShowModal); only that event drops the
// keep-alive, then the app's onDismiss runs. Android has no dismiss event: `visible` alone.

import { Platform } from '@symbiote-native/engine';

// Modal.js `defaultProps.visible = true`: defaultProps fill only `undefined`, so an unset
// `visible` shows and an explicit `false`/`null` hides.
export function isModalVisible(visible: unknown): boolean {
  return visible === undefined || visible === true;
}

export type IModalState = {
  isRendered: boolean;
};

// On first render the keep-alive matches `visible`: a modal that starts visible is rendered,
// one that starts hidden contributes no node (the render gate returns null).
export function createInitialModalState(isVisible: boolean): IModalState {
  return { isRendered: isVisible };
}

export type IModalAction =
  // visible became true: re-arm the keep-alive (Modal.js componentDidUpdate).
  | { type: 'show' }
  // visible became false: drop the keep-alive so the node can unmount after the exit
  // transition. onDismiss is NOT fired here; the native topDismiss event is its single source.
  | { type: 'hide' };

// Identity-stable when nothing changes (returns the same object) so the adapter's effect/watch
// triggers no spurious re-render, matching React's guarded setState in Modal.js's effect.
export function modalReducer(
  state: IModalState,
  action: IModalAction,
): IModalState {
  switch (action.type) {
    case 'show':
      return state.isRendered ? state : { isRendered: true };
    case 'hide':
      return state.isRendered ? { isRendered: false } : state;
  }
}

// Modal.js `_shouldShowModal`: iOS keeps the node through its exit animation until the native
// dismiss drops the keep-alive; Android shows on `visible` alone.
export function shouldRenderModal(
  isVisible: boolean,
  state: IModalState,
  os: string = Platform.OS,
): boolean {
  return os === 'ios' ? isVisible || state.isRendered : isVisible;
}

// Modal.js componentDidUpdate: false->true arms the keep-alive; true->false does NOTHING — only the
// native `onDismiss` (iOS) drops it, via `{type: 'hide'}` from the adapter's dismiss handler.
export function modalVisibilityAction(
  isVisible: boolean,
): IModalAction | undefined {
  return isVisible ? { type: 'show' } : undefined;
}
