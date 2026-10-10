// RN's own `useColorScheme`, typed here because the source ships none
// @ts-expect-error - untyped Flow source
import useColorSchemeUpstream from 'react-native/Libraries/Utilities/useColorScheme';

import type { IColorSchemeName } from '@symbiote-native/engine';

export const useColorScheme: () => IColorSchemeName | null | undefined =
  useColorSchemeUpstream;
