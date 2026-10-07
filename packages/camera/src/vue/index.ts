// @symbiote-native/camera/vue: камера, съёмка, запись видео и сканирование кодов на общем ядре

export { CameraView } from './camera-view';
export {
  useCameraPermissions,
  useMicrophonePermissions,
} from './use-camera-permissions';
export type { IUseCameraPermissionsHook } from './use-camera-permissions';
export * from '../core';
