// The `<switch>` tag's prop surface. The controlled handshake the wrapper used to run — the
// lastNativeReport mirror, the snap-back command when the parent rejects a toggle, the platform
// track-colour mapping — is the tag's own behavior now (`registerSwitchBehavior`, wired by
// `../register`), which is also where the iOS/Android command-name split lives.

import type { ISwitchProps as ISwitchBaseProps } from '@symbiote-native/components';
import type { IClassNameValue } from '@symbiote-native/engine';

export type {
  ISwitchTrackColor,
  ISwitchChangeEvent,
} from '@symbiote-native/components';

// The agnostic base (the controlled value contract, colors, style, accessibility) is shared and
// re-exported rather than redeclared; only the class-styling field is per-adapter, and Solid's
// idiom is `class` — the spelling an author already writes on a raw host tag. React's is
// `className` (<prop_types_split_agnostic_vs_per_adapter>).
export type ISwitchProps = ISwitchBaseProps & { class?: IClassNameValue };
