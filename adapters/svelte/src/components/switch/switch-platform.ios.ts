// Switch, iOS platform mapping. iOS's native Switch takes onTintColor (ON-track) / tintColor
// (OFF-track), and snaps native back via the `setValue` command (Switch.js:221-225) — same
// facts adapters/react's switch/index.ios.ts and adapters/vue's switch/index.ios.ts encode.
import type { ISwitchHostPlatform } from './switch-platform-types';

export type { ISwitchHostPlatform };

export const PLATFORM: ISwitchHostPlatform = {
  snapBackCommand: 'setValue',
  trackColorProps: (_value, trackColor) => ({
    onTintColor: trackColor?.true,
    tintColor: trackColor?.false,
  }),
};
