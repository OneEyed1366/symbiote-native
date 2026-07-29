import { ROUTE_NAME } from './routes';
import type { IRouteName } from './routes';

// The Expo-package demo suite groups its tour screens into thematic "lines" — which package each
// screen exercises — carried through MenuScreen's row badges and each demo screen's own line tag.
// One color per line replaces the single flat accent every row/button used to share. Kept in sync
// by hand with App.css's `:root` `--line-*` tokens — CSS custom properties and this module are
// different runtimes with no shared import path.
export const NAV_LINE = {
  Sensors: 'sensors',
  LocalAuth: 'local-auth',
  Haptics: 'haptics',
  Clipboard: 'clipboard',
  Battery: 'battery',
  Brightness: 'brightness',
  Cellular: 'cellular',
  Network: 'network',
} as const;

export type INavLine = (typeof NAV_LINE)[keyof typeof NAV_LINE];

export const LINE_COLOR: Record<INavLine, string> = {
  // Amber — @symbiote-native/sensors' own tour stop (Accelerometer/Gyroscope/Magnetometer/
  // DeviceMotion/Pedometer over expo-modules-core), distinct from every line color above.
  [NAV_LINE.Sensors]: '#f6ad55',
  // Red — @symbiote-native/local-auth's own tour stop, distinct from every color above.
  [NAV_LINE.LocalAuth]: '#ef4444',
  // Violet — @symbiote-native/haptics' own tour stop, shared across all 4 expo-* apps.
  [NAV_LINE.Haptics]: '#8b5cf6',
  // Teal — @symbiote-native/clipboard's own tour stop, shared across all 4 expo-* apps.
  [NAV_LINE.Clipboard]: '#14b8a6',
  // Green — @symbiote-native/battery's own tour stop, shared across all 4 expo-* apps.
  [NAV_LINE.Battery]: '#22c55e',
  // Gold — @symbiote-native/brightness's own tour stop, shared across all 4 expo-* apps.
  [NAV_LINE.Brightness]: '#facc15',
  // Blue — @symbiote-native/cellular's own tour stop, shared across all 4 expo-* apps.
  [NAV_LINE.Cellular]: '#3b82f6',
  // Cyan — @symbiote-native/network's own tour stop, shared across all 4 expo-* apps.
  [NAV_LINE.Network]: '#06b6d4',
};

export type INavLineInfo = {
  line: INavLine;
  code: string;
  label: string;
};

// Every route reachable from MenuScreen, minus Menu itself.
export type ITourRouteName = Exclude<IRouteName, typeof ROUTE_NAME.Menu>;

export const ROUTE_LINE_INFO: Record<ITourRouteName, INavLineInfo> = {
  [ROUTE_NAME.Sensors]: { line: NAV_LINE.Sensors, code: 'SN', label: 'SENSORS LINE' },
  [ROUTE_NAME.LocalAuth]: { line: NAV_LINE.LocalAuth, code: 'LA', label: 'LOCAL AUTH LINE' },
  [ROUTE_NAME.Haptics]: { line: NAV_LINE.Haptics, code: 'HP', label: 'HAPTICS LINE' },
  [ROUTE_NAME.Clipboard]: { line: NAV_LINE.Clipboard, code: 'CB', label: 'CLIPBOARD LINE' },
  [ROUTE_NAME.Battery]: { line: NAV_LINE.Battery, code: 'BT', label: 'BATTERY LINE' },
  [ROUTE_NAME.Brightness]: { line: NAV_LINE.Brightness, code: 'BR', label: 'BRIGHTNESS LINE' },
  [ROUTE_NAME.Cellular]: { line: NAV_LINE.Cellular, code: 'CL', label: 'CELLULAR LINE' },
  [ROUTE_NAME.Network]: { line: NAV_LINE.Network, code: 'NW', label: 'NETWORK LINE' },
};
