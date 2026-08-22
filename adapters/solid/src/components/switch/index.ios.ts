// Switch, iOS host binding. iOS's native Switch takes onTintColor (ON-track) / tintColor
// (OFF-track), and snaps native back via the `setValue` command (Switch.js:221-225) — the same
// facts adapters/react's, adapters/vue's and adapters/svelte's iOS bindings encode.

import { createSwitch } from './shared';

export type { ISwitchProps, ISwitchTrackColor } from './shared';

export const Switch = createSwitch({
  snapBackCommand: 'setValue',
  trackColorProps: (_value, trackColor) => ({
    onTintColor: trackColor?.true,
    tintColor: trackColor?.false,
  }),
});
