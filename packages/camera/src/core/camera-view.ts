// Ядро `CameraView`: нативный view камеры, чьи функции вызываются через `ViewPrototypes`
import { requireNativeViewManager } from 'expo-modules-core';
import { el } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import { defineExpoNativeView, isDevBuild } from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { createCameraViewEvents } from './camera-view-events';
import { createCameraViewHandle } from './camera-view-handle';
import type { ICameraViewHandle } from './camera-view-handle';
import { CAMERA_MODULE_NAME } from './constants';
import { ensureNativeProps } from './props';

// Регистрация идёт при рендере: побочный эффект барреля теряется в release
const cameraView = defineExpoNativeView(
  requireNativeViewManager,
  CAMERA_MODULE_NAME,
);

export const cameraViewName = cameraView.name;

export const ensureCameraViewRegistered = cameraView.ensureRegistered;

// What upstream's `defaultProps` gave the class component
const DEFAULT_VIEW_PROPS = {
  zoom: 0,
  facing: 'back',
  enableTorch: false,
  mode: 'picture',
  flash: 'off',
};

export type ICameraView = {
  handle: ICameraViewHandle;
  /** `null` means the view cannot register and the caller renders nothing */
  render(props: object): IDescriptor | null;
};

/** One per mounted view, `getNode` answers the host node once it exists */
export function createCameraView(
  getNode: () => ISymbioteNode | null | undefined,
): ICameraView {
  const toEvents = createCameraViewEvents();
  return {
    handle: createCameraViewHandle(getNode),
    render: props => {
      if (!ensureCameraViewRegistered()) {
        if (isDevBuild()) console.warn("'CameraView' is not available.");
        return null;
      }
      return el(cameraViewName(), {
        ...ensureNativeProps({ ...DEFAULT_VIEW_PROPS, ...props }),
        ...toEvents(props),
      });
    },
  };
}
