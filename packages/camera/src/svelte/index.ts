// @symbiote-native/camera/svelte: камера, съёмка, запись видео и сканирование кодов на общем ядре

export { default as CameraView } from './camera-view.svelte';
export {
  useCameraPermissions,
  useMicrophonePermissions,
} from './use-camera-permissions.svelte';
export type { IUseCameraPermissionsHook } from './use-camera-permissions.svelte';
export * from '../core';
