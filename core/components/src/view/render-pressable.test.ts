// DUPLICATE-CANDIDATE (found during a coverage sweep, not deleted here): there is no flat
// `view/render-pressable.ts` source file — only `view/render-pressable/index.ts` exists — so this
// flat test's `./render-pressable` specifier resolves as a DIRECTORY import to the exact same live
// module as `./render-pressable/render-pressable.test.ts`. Both files are genuinely live; the
// folder version is treated as canonical here (fuller suite, and folder-form matches this repo's
// ADR-0026 file-layout migration target) — this flat file duplicates a SUBSET of it and is flagged
// as a deletion candidate, not removed. See this task's report for the full collision finding.
//
// Co-located unit test for Pressable's 3 agnostic gating predicates. These are also the
// predicates the Angular Pressable calls directly (it has no listener bag to spread onto - see
// adapters/angular/src/components/pressable/index.ts), so the canonical file (the folder sibling
// of this one) is the single source of truth for the disabled/cancelable semantics both sides
// must agree on; this file keeps only the 3-predicate subset for backward compatibility with
// whatever still imports this path.

import { describe, expect, it } from 'vitest';
import { isTerminationAllowed, shouldClaimResponder, shouldSuppressPress } from './render-pressable';

describe('shouldSuppressPress', () => {
  it('suppresses when disabled is true', () => {
    expect(shouldSuppressPress(true)).toBe(true);
  });

  it('does not suppress when disabled is false', () => {
    expect(shouldSuppressPress(false)).toBe(false);
  });

  it('does not suppress when disabled is undefined', () => {
    expect(shouldSuppressPress(undefined)).toBe(false);
  });
});

describe('shouldClaimResponder', () => {
  it('claims the responder when disabled is false', () => {
    expect(shouldClaimResponder(false)).toBe(true);
  });

  it('claims the responder when disabled is undefined', () => {
    expect(shouldClaimResponder(undefined)).toBe(true);
  });

  it('refuses to claim the responder when disabled is true', () => {
    expect(shouldClaimResponder(true)).toBe(false);
  });
});

describe('isTerminationAllowed', () => {
  it('allows termination when cancelable is true', () => {
    expect(isTerminationAllowed(true)).toBe(true);
  });

  it('refuses termination when cancelable is false', () => {
    expect(isTerminationAllowed(false)).toBe(false);
  });

  // This is exactly the case render-pressable.ts and the Angular Pressable used to disagree on:
  // render-pressable.ts left the whole onResponderTerminationRequest listener off the bag when
  // cancelable is unset (deferring to RN's own default), while Angular's allowTermination()
  // hardcoded `cancelable !== false` (defaulting to allowed). Both resolve to "allowed" - this
  // predicate is the single definition both sides now call, matching RN's documented default.
  it('defaults to allowed when cancelable is undefined, matching RN default-true-when-unset', () => {
    expect(isTerminationAllowed(undefined)).toBe(true);
  });
});
