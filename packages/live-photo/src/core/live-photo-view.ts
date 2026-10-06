// Ядро `LivePhotoView`: нативный view с живыми фото, только iOS
import {
  Platform,
  UnavailabilityError,
  requireNativeModule,
  requireNativeViewManager,
} from 'expo-modules-core';
import { el } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import {
  defineExpoNativeView,
  defineExpoViewMethods,
  getNativeTag,
  isDevBuild,
} from '@symbiote-native/engine';
import type { ISymbioteEvent, ISymbioteNode } from '@symbiote-native/engine';
import { LIVE_PHOTO_MODULE_NAME, LIVE_PHOTO_PACKAGE_NAME } from './constants';
import type {
  ILivePhotoLoadError,
  ILivePhotoPlaybackStyle,
  ILivePhotoViewHandle,
} from './types';

const LOAD_ERROR_PROP = 'onLoadError';

// Регистрация идёт при рендере: побочный эффект барреля теряется в release
const livePhotoView = defineExpoNativeView(
  requireNativeViewManager,
  LIVE_PHOTO_MODULE_NAME,
);

const callViewFunction = defineExpoViewMethods(
  requireNativeModule,
  LIVE_PHOTO_MODULE_NAME,
);

export const livePhotoViewName = livePhotoView.name;

function isAvailable(): boolean {
  return Platform.select({ ios: true, default: false });
}

export function ensureLivePhotoViewRegistered(): boolean {
  return isAvailable() && livePhotoView.ensureRegistered();
}

function isLoadError(value: unknown): value is ILivePhotoLoadError {
  return typeof Reflect.get(Object(value), 'message') === 'string';
}

// Нативное событие несёт полезную нагрузку в `nativeEvent`, наружу уходит она сама
function toLoadErrorHandler(onLoadError: unknown) {
  return (event: ISymbioteEvent): void => {
    if (typeof onLoadError !== 'function') return;
    if (isLoadError(event.nativeEvent)) onLoadError(event.nativeEvent);
  };
}

/** `null` means the caller renders nothing, live photos exist only on iOS */
export function renderLivePhotoView(props: object): IDescriptor | null {
  if (!ensureLivePhotoViewRegistered()) {
    if (isDevBuild()) console.warn("'LivePhotoView' is not available.");
    return null;
  }
  return el(livePhotoViewName(), {
    ...Object.fromEntries(Object.entries(props)),
    [LOAD_ERROR_PROP]: toLoadErrorHandler(Reflect.get(props, LOAD_ERROR_PROP)),
  });
}

// A view that has not committed yet has no native tag, the call is dropped like upstream's
// `nativeRef.current?.` does
function callIfMounted(
  getNode: () => ISymbioteNode | null | undefined,
  method: string,
  args: readonly unknown[],
): void {
  if (!isAvailable()) {
    throw new UnavailabilityError(LIVE_PHOTO_PACKAGE_NAME, method);
  }
  const node = getNode();
  if (node && getNativeTag(node) !== undefined) {
    callViewFunction(node, method, args);
  }
}

export function createLivePhotoViewHandle(
  getNode: () => ISymbioteNode | null | undefined,
): ILivePhotoViewHandle {
  return {
    startPlayback: (playbackStyle?: ILivePhotoPlaybackStyle) =>
      callIfMounted(getNode, 'startPlayback', [playbackStyle ?? 'full']),
    stopPlayback: () => callIfMounted(getNode, 'stopPlayback', []),
  };
}
