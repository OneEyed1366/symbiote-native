// The context key ScrollView uses to hand its scroll-offset AnimatedValue (plus the
// inverted/viewport-height getters the sticky math needs) down to a manually-composed
// ScrollViewStickyHeader — the Svelte substitute for the wrapStickyHeaders() auto-injection
// React/Vue do by child index (see scroll-view-props.ts's KNOWN GAP note for why no auto-wrap
// exists here: Svelte hands a component only an opaque Snippet, not an introspectable/indexable
// child list). Getter FUNCTIONS, not raw values: Svelte context is captured once at getContext()
// time, so a field that changes after mount (viewportHeight updates on every scroll-view layout;
// inverted rarely does) must be read live through a closure rather than copied.
import type { AnimatedValue } from '@symbiote-native/engine';

export const SCROLL_VIEW_STICKY_CONTEXT_KEY = Symbol('symbiote-scroll-view-sticky');

export type IScrollViewStickyContext = {
  scrollAnimatedValue: AnimatedValue;
  getInverted: () => boolean | undefined;
  getViewportHeight: () => number | undefined;
};
