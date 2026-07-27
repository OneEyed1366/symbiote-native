import { ROUTE_NAME } from './routes';
import type { IRouteName } from './routes';

// This app demos Expo-modules-core-based package ports only (no @symbiote-native/navigation
// feature tour — that lives in the pure examples/react canary). One "line" per package, carried
// through MenuScreen's row badges and each demo screen's own line tag. Kept in sync by hand with
// App.css's `:root` `--line-*` tokens — CSS custom properties and this module are different
// runtimes with no shared import path.
export const NAV_LINE = {
  Sensors: 'sensors',
  LocalAuth: 'local-auth',
} as const;

export type INavLine = (typeof NAV_LINE)[keyof typeof NAV_LINE];

export const LINE_COLOR: Record<INavLine, string> = {
  // Warm amber — @symbiote-native/sensors.
  [NAV_LINE.Sensors]: '#f5a623',
  // Crimson red — @symbiote-native/local-auth. Distinct from Sensors' amber and, deliberately,
  // the color security/lock iconography already reads as at a glance.
  [NAV_LINE.LocalAuth]: '#ef4444',
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
};
