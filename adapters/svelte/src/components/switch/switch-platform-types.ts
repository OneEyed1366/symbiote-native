// The neutral type both platform files share, so neither `.ios.ts` nor `.android.ts` imports
// FROM the other (which would read backward and risk Metro bundling both regardless of
// platform, even though a `type`-only import is erased under this tsconfig's
// `verbatimModuleSyntax`).
import type { ISwitchTrackColor } from '@symbiote-native/components';

export type ISwitchHostPlatform = {
  snapBackCommand: string;
  trackColorProps: (
    value: boolean,
    trackColor?: ISwitchTrackColor,
  ) => Record<string, unknown>;
};
