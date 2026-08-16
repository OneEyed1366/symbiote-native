// Loose prop type shared by every Animated.* component — the Svelte twin of React's
// IAnimatedComponentProps (adapters/react/src/modules/animated/create-animated-component.tsx)
// and Vue's untyped-attrs forwarding (adapters/vue/src/modules/animated/create-animated-component.ts).
// An Animated component's props are open by design: any prop MAY hold an AnimatedNode (a bare
// value, or nested inside `style`) instead of its usual concrete type, so a fully-typed
// IViewProps/IScrollViewProps-shaped surface would fight the very thing this wraps. `style` /
// `children` / the passthrough-style escape hatch are named because every wrapper reads them;
// everything else rides the index signature straight through to `reduceProps`/`AnimatedProps`,
// unexamined.
import type { Snippet } from 'svelte';

export interface IAnimatedComponentProps {
  style?: unknown;
  children?: Snippet;
  // RN's passthroughAnimatedPropExplicitValues: explicit (already-rasterized) values that
  // override the animated prop in the COMMITTED props (sticky-header passthrough — see
  // core/engine/src/animated/shared.ts's readPassthroughStyle).
  passthroughAnimatedPropExplicitValues?: unknown;
  [key: string]: unknown;
}
