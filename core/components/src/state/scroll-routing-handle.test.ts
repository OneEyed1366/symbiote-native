// Compile-time + shape proof for the extraction in scroll-routing-handle.ts: both list
// handle types must stay composed of the SAME shared routing tail plus only their own
// primary member(s), so a stub satisfying one composes cleanly into the other. The real
// drift guard is structural (TypeScript itself, via these literal assignments and
// expectTypeOf) - `pnpm --filter @symbiote-native/components run typecheck` excludes
// *.test.ts, so removing a member here needs a separate check: run the Vue adapter's
// typecheck, whose literal `handle: IVirtualizedListHandle = {...}` and
// `isVirtualizedListHandle` guards give real excess/missing-property errors.
//
// N/A: IScrollRoutingHandle itself carries zero runtime logic — it's a pure type. There is no
// concrete implementing class in this module to exercise, so "covered" here means proven
// STRUCTURALLY (compile fails if a member is missing/renamed), not behaviorally. No Negative
// group: a type has no throwing path.
//
// coverage note: an earlier version of this file asserted
// `handle.getNativeScrollRef() === handle.getScrollableNode()` — that assertion compared two
// values the SAME test-local stub was told to return, so it was guaranteed to pass regardless of
// what any real implementation does; a tautology, not a proof, so it's removed here. The actual
// product claim it gestured at ("today all three return the same underlying handle") belongs to
// whichever adapter class implements IScrollRoutingHandle for real — out of this pure-type
// module's testable surface.

import { describe, expect, expectTypeOf, it } from 'vitest';
import type { IScrollViewHandle } from '../scroll-view-commands';
import type { IScrollRoutingHandle } from './scroll-routing-handle';
import type { IVirtualizedListHandle } from './virtualized-list';
import type { IVirtualizedSectionListHandle } from './section-list';

function createRoutingStub(calls: string[]): IScrollRoutingHandle {
  const fakeScrollHandle: IScrollViewHandle = {
    scrollTo: () => calls.push('scrollTo'),
    scrollToEnd: () => calls.push('scrollToEnd'),
    flashScrollIndicators: () => calls.push('inner-flash'),
    getScrollNode: () => null,
  };
  return {
    flashScrollIndicators: () => calls.push('flashScrollIndicators'),
    getNativeScrollRef: () => fakeScrollHandle,
    getScrollableNode: () => fakeScrollHandle,
    getScrollResponder: () => fakeScrollHandle,
    getScrollNode: () => null,
    recordInteraction: () => calls.push('recordInteraction'),
  };
}

describe('IScrollRoutingHandle composition (Positive — structural, not behavioral)', () => {
  // why: IVirtualizedListHandle must stay literally `IScrollRoutingHandle & { scrollTo* }` — if a
  // future edit renamed/dropped a routing member, this literal assignment fails to COMPILE (TS
  // excess/missing-property check), which is the real assertion; the runtime calls below only
  // confirm the composed object is actually callable, not a type-only phantom.
  it('IVirtualizedListHandle composes from the shared routing tail plus its own scrollTo* primaries', () => {
    const calls: string[] = [];
    const routing = createRoutingStub(calls);
    const handle: IVirtualizedListHandle = {
      ...routing,
      scrollToOffset: ({ offset }) => calls.push(`scrollToOffset:${offset}`),
      scrollToIndex: ({ index }) => calls.push(`scrollToIndex:${index}`),
      scrollToItem: () => calls.push('scrollToItem'),
      scrollToEnd: () => calls.push('scrollToEnd'),
    };

    handle.scrollToOffset({ offset: 10 });
    handle.recordInteraction();
    handle.flashScrollIndicators();
    expect(calls).toEqual(['scrollToOffset:10', 'recordInteraction', 'flashScrollIndicators']);
  });

  // why: the section-list twin — same routing tail, its own scrollToLocation primary.
  it('IVirtualizedSectionListHandle composes from the shared routing tail plus scrollToLocation', () => {
    const calls: string[] = [];
    const routing = createRoutingStub(calls);
    const handle: IVirtualizedSectionListHandle = {
      ...routing,
      scrollToLocation: ({ sectionIndex, itemIndex }) =>
        calls.push(`scrollToLocation:${sectionIndex}:${itemIndex}`),
    };

    handle.scrollToLocation({ sectionIndex: 1, itemIndex: 2 });
    handle.getScrollNode();
    handle.recordInteraction();
    expect(calls).toEqual(['scrollToLocation:1:2', 'recordInteraction']);
  });

  // why: the compiler-level twin of the two tests above — proves the extends relationship holds
  // for the FULL type (not just one hand-picked literal), independent of any runtime stub.
  it('both handle types extend the identical IScrollRoutingHandle base (type-level)', () => {
    expectTypeOf<IVirtualizedListHandle>().toExtend<IScrollRoutingHandle>();
    expectTypeOf<IVirtualizedSectionListHandle>().toExtend<IScrollRoutingHandle>();
  });
});
