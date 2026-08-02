// Route-name constants shared between App.tsx's <Stack.Screen name="..."> registrations and
// every screen's navigation.push(...)/navigation.jumpTo(...) calls — a single source of truth so
// a typo can't silently create a dead route on one side only.

export const ROUTE_NAME = {
  Menu: 'Menu',
  Sensors: 'Sensors',
  LocalAuth: 'LocalAuth',
  Haptics: 'Haptics',
  Clipboard: 'Clipboard',
  Battery: 'Battery',
  Brightness: 'Brightness',
  Cellular: 'Cellular',
  Network: 'Network',
  Device: 'Device',
  Application: 'Application',
  Crypto: 'Crypto',
  StandardWebCrypto: 'StandardWebCrypto',
  SystemUi: 'SystemUi',
  StoreReview: 'StoreReview',
  KeepAwake: 'KeepAwake',
  ScreenOrientation: 'ScreenOrientation',
  Localization: 'Localization',
  TrackingTransparency: 'TrackingTransparency',
} as const;

export type IRouteName = (typeof ROUTE_NAME)[keyof typeof ROUTE_NAME];
