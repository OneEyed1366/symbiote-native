import { Platform, requireNativeViewManager } from 'expo-modules-core';
import { el } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import { defineExpoNativeView } from '@symbiote-native/engine';
import { VIDEO_MODULE_NAME, VIDEO_VIEW_NAMES } from './constants';
import type { IVideoAirPlayButtonProps } from './view-types';

// Регистрация идёт при рендере: побочный эффект барреля теряется в release
const airPlayButton = defineExpoNativeView(
  requireNativeViewManager,
  VIDEO_MODULE_NAME,
  VIDEO_VIEW_NAMES.airPlayButton,
);

export const videoAirPlayButtonViewName = airPlayButton.name;

const MIN_SIZE = { minWidth: 30, minHeight: 30 };

// What only the native route picker takes, the plain fallback view must not get it
const AIRPLAY_ONLY_PROPS = new Set<string>([
  'tint',
  'activeTint',
  'prioritizeVideoDevices',
  'onBeginPresentingRoutes',
  'onEndPresentingRoutes',
] as const satisfies readonly (keyof IVideoAirPlayButtonProps)[]);

function isAirPlayAvailable(): boolean {
  return (
    Platform.select({ ios: true, default: false }) &&
    airPlayButton.ensureRegistered()
  );
}

/** A plain view with the minimum size where the system route picker does not exist */
export function renderVideoAirPlayButton(props: object): IDescriptor {
  const style = [MIN_SIZE, Reflect.get(props, 'style')];
  if (isAirPlayAvailable()) {
    return el(airPlayButton.name(), { ...props, style });
  }
  const viewProps = Object.entries(props).filter(
    ([key]) => !AIRPLAY_ONLY_PROPS.has(key),
  );
  return el('view', { ...Object.fromEntries(viewProps), style });
}
