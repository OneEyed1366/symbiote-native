// `IStickyHeaderComponentProps`'s canonical home — plain `.ts` file, same reason as
// scroll-view-props.ts. Deliberately does NOT extend core's `IStickyHeaderProps` verbatim: that
// type makes `scrollAnimatedValue` / `inverted` / `scrollViewHeight` required fields (React/Vue
// always supply them, since their wrapStickyHeaders() auto-injects the wrapper with every field
// filled in). This adapter has no auto-wrap (see scroll-view-props.ts's KNOWN GAP note), so a
// manually-composed <ScrollViewStickyHeader> instead resolves those three from the parent
// ScrollView's context (scroll-view-sticky-context.ts) when omitted — see sticky-header.svelte.
import type { Snippet } from 'svelte';
import type { AnimatedValue, ISymbioteEvent } from '@symbiote-native/engine';

export type IStickyHeaderComponentProps = {
  // y of the NEXT sticky header in content space, the collision point past which this header
  // stops translating and scrolls off. No cross-talk wiring in this adapter (no auto-wrap to
  // derive it from) — left undefined, a header sticks indefinitely once pinned, the safe default
  // for the common single-sticky-header case. Pass explicitly for a manual multi-header setup.
  nextHeaderLayoutY?: number;
  onLayout?: (event: ISymbioteEvent) => void;
  scrollAnimatedValue?: AnimatedValue;
  inverted?: boolean;
  scrollViewHeight?: number;
  children?: Snippet;
};
