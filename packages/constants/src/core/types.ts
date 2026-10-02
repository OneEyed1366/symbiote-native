export enum AppOwnership {
  Expo = 'expo',
}

export enum ExecutionEnvironment {
  Bare = 'bare',
  Standalone = 'standalone',
  StoreClient = 'storeClient',
}

export enum UserInterfaceIdiom {
  Handset = 'handset',
  Tablet = 'tablet',
  Desktop = 'desktop',
  TV = 'tv',
  Unsupported = 'unsupported',
}

/** @platform ios */
export type IIosPlatformConstants = {
  buildNumber: string | null;
  platform: string;
  model: string | null;
  userInterfaceIdiom: UserInterfaceIdiom;
  systemVersion: string;
};

/** @platform android */
export type IAndroidPlatformConstants = {
  versionCode: number;
};

export type IPlatformConstants = {
  ios?: IIosPlatformConstants;
  android?: IAndroidPlatformConstants;
};

// The native fields of upstream's `Constants`. The manifest family (`manifest`, `manifest2`,
// `expoConfig`, `expoGoConfig`, `easConfig`) is not ported, this project has no Expo manifest
export type IConstants = {
  appOwnership: AppOwnership | null;
  debugMode: boolean;
  deviceName?: string;
  deviceYearClass: number | null;
  executionEnvironment: ExecutionEnvironment;
  experienceUrl: string;
  expoRuntimeVersion: string | null;
  expoVersion: string | null;
  isDetached?: boolean;
  intentUri?: string;
  isHeadless: boolean;
  linkingUri: string;
  sessionId: string;
  statusBarHeight: number;
  systemFonts: string[];
  systemVersion?: number;
  supportedExpoSdks?: string[];
  platform?: IPlatformConstants;
  getWebViewUserAgentAsync: () => Promise<string | null>;
};
