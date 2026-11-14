// The web Platform: `OS` is the static 'web' and there is no PlatformConstants module to read,
// so every device fact is a neutral constant. Metro picks this file for the web platform

import {
  UNKNOWN_VERSION,
  type IPlatformSelectSpec,
  type IPlatformStatic,
} from './shared';

export type {
  IPlatformOSType,
  IPlatformSelectSpec,
  IPlatformStatic,
} from './shared';

const OS_WEB = 'web';

export const Platform: IPlatformStatic<never> = {
  OS: OS_WEB,
  Version: UNKNOWN_VERSION,
  constants: undefined,
  isPad: false,
  isTV: false,
  isVision: false,
  isTesting: false,
  isDisableAnimations: false,
  isMacCatalyst: false,

  // `native` is the iOS and Android shorthand, so it is skipped here: web -> default
  select<T>(spec: IPlatformSelectSpec<T>): T | undefined {
    if ('web' in spec) return spec.web;
    return spec.default;
  },
};
