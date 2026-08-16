// Port of react-native-bootsplash's own useHideAnimation over the framework-agnostic
// HideAnimationController + style computation in core/. The controller is built lazily ONCE
// via a useRef factory (never reconstructed across re-renders); the effect below has NO
// dependency array and re-syncs the controller's config after EVERY render on purpose, since
// `ready` flipping true is only picked up that way. The native constants ride along on that same
// once-built controller, so there is no separate useState to hold them.
//
// No useMemo around the style computation: upstream memoizes on ~15 individual primitive
// fields so Object.is compares by value rather than by the config/manifest object's
// reference (callers construct that object fresh every render, so keying off the whole
// object would recompute anyway). Not worth reproducing for a splash screen shown a couple
// of renders at boot — computing plainly is simpler and equally cheap.
import { useEffect, useRef } from 'react';
import {
  computeHideAnimationStyles,
  HideAnimationController,
  type IHideAnimationConfig,
  type IHideAnimationResult,
} from '../../../core';

export function useHideAnimation(config: IHideAnimationConfig): IHideAnimationResult {
  const controllerRef = useRef<HideAnimationController | null>(null);
  if (controllerRef.current == null) {
    controllerRef.current = new HideAnimationController(config);
  }
  const controller = controllerRef.current;

  useEffect(() => {
    controller.updateConfig(config);
  });

  return computeHideAnimationStyles(config, controller.constants, controller);
}
