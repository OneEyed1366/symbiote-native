import { UnavailabilityError } from 'expo-modules-core';
import { expoConstants } from './native-module';
import type { INativeConstantsModule } from './native-module';
import type { IConstants } from './types';

const NATIVE_MODULE_NAME = 'expo-constants';

/** The native fields of the `ExponentConstants` module, without the Expo manifest family */
export function createConstants(native: INativeConstantsModule): IConstants {
  const {
    name,
    appOwnership,
    manifest,
    manifest2,
    expoConfig,
    expoGoConfig,
    easConfig,
    getWebViewUserAgentAsync,
    ...nativeFields
  } = native;

  return {
    ...nativeFields,
    // Ensure this is null in bare workflow
    appOwnership: appOwnership ?? null,
    async getWebViewUserAgentAsync() {
      if (!getWebViewUserAgentAsync) {
        throw new UnavailabilityError(
          NATIVE_MODULE_NAME,
          'getWebViewUserAgentAsync',
        );
      }
      return getWebViewUserAgentAsync();
    },
  };
}

export const Constants: IConstants = createConstants(expoConstants);
