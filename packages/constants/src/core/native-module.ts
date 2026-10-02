import { requireNativeModule } from 'expo-modules-core';
import type { AppOwnership, IConstants } from './types';

const EXPONENT_CONSTANTS_MODULE_NAME = 'ExponentConstants';

// The module object itself carries the constants as properties. Its manifest family is typed
// `unknown` because it is read only to be dropped
export type INativeConstantsModule = Omit<
  IConstants,
  'appOwnership' | 'getWebViewUserAgentAsync'
> & {
  name?: string;
  appOwnership?: AppOwnership | null;
  manifest?: unknown;
  manifest2?: unknown;
  expoConfig?: unknown;
  expoGoConfig?: unknown;
  easConfig?: unknown;
  getWebViewUserAgentAsync?: () => Promise<string | null>;
};

export const expoConstants = requireNativeModule<INativeConstantsModule>(
  EXPONENT_CONSTANTS_MODULE_NAME,
);
