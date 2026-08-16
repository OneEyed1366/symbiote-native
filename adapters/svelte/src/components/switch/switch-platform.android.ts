// Switch, Android platform mapping. AndroidSwitch takes trackColorForTrue /
// trackColorForFalse plus trackTintColor (the color for the CURRENT value), and snaps native
// back via the `setNativeValue` command (Switch.js:221-225) — same facts adapters/react's
// switch/index.android.ts and adapters/vue's switch/index.android.ts encode.
import type { ISwitchHostPlatform } from './switch-platform-types';

export type { ISwitchHostPlatform };

export const PLATFORM: ISwitchHostPlatform = {
  snapBackCommand: 'setNativeValue',
  trackColorProps: (value, trackColor) => ({
    trackColorForFalse: trackColor?.false,
    trackColorForTrue: trackColor?.true,
    trackTintColor: value ? trackColor?.true : trackColor?.false,
  }),
};
