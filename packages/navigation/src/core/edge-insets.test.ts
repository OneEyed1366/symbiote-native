// Which header applies each system inset, as react-native-screens decides it down a stack hierarchy

import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_EDGE_INSETS,
  findAncestorEdgeInsets,
  resolveEdgeInsetApplication,
} from './edge-insets';
import type { IEdgeInsetState } from './edge-insets';
import { featureFlags } from './screens-config';

const VISIBLE = { headerVisible: true };

describe('top inset', () => {
  it('goes to the outermost visible header only', () => {
    const outer = resolveEdgeInsetApplication(EMPTY_EDGE_INSETS, VISIBLE);
    const inner = resolveEdgeInsetApplication(outer.next, VISIBLE);

    expect(outer.consumeTopInset).toBe(true);
    expect(inner.consumeTopInset).toBe(false);
  });

  it('is left to a nested header when the outer header is hidden', () => {
    const outer = resolveEdgeInsetApplication(EMPTY_EDGE_INSETS, {
      headerVisible: false,
    });
    const inner = resolveEdgeInsetApplication(outer.next, VISIBLE);

    expect(outer.consumeTopInset).toBe(false);
    expect(inner.consumeTopInset).toBe(true);
  });

  it('stays off for a header that opted out, and still counts as taken for nested headers', () => {
    const outer = resolveEdgeInsetApplication(EMPTY_EDGE_INSETS, {
      headerVisible: true,
      disableTopInsetApplication: true,
    });

    expect(outer.consumeTopInset).toBe(false);
    expect(outer.next.topAlreadyApplied).toBe(true);
  });

  it('goes to every header under the legacy behavior flag', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    featureFlags.experiment.androidLegacyTopInsetBehavior = true;
    try {
      const outer = resolveEdgeInsetApplication(EMPTY_EDGE_INSETS, VISIBLE);
      const inner = resolveEdgeInsetApplication(outer.next, VISIBLE);

      expect(outer.legacyTopInsetBehavior).toBe(true);
      expect(inner.consumeTopInset).toBe(true);
    } finally {
      featureFlags.experiment.androidLegacyTopInsetBehavior = false;
      vi.restoreAllMocks();
    }
  });
});

describe('left, right and bottom insets', () => {
  it('are applied by every header until one opts out', () => {
    const outer = resolveEdgeInsetApplication(EMPTY_EDGE_INSETS, VISIBLE);
    const inner = resolveEdgeInsetApplication(outer.next, VISIBLE);

    expect(outer.consumeLeftInset).toBe(true);
    expect(outer.consumeRightInset).toBe(true);
    expect(outer.consumeBottomInset).toBe(true);
    expect(inner.consumeLeftInset).toBe(true);
  });

  it('stay off for the whole subtree once a header opts out of an edge', () => {
    const outer = resolveEdgeInsetApplication(EMPTY_EDGE_INSETS, {
      headerVisible: true,
      disableLeftInsetApplication: true,
      disableBottomInsetApplication: true,
    });
    const inner = resolveEdgeInsetApplication(outer.next, {
      headerVisible: true,
      disableLeftInsetApplication: false,
    });

    expect(outer.consumeLeftInset).toBe(false);
    expect(outer.consumeBottomInset).toBe(false);
    expect(outer.consumeRightInset).toBe(true);
    expect(inner.consumeLeftInset).toBe(false);
    expect(inner.consumeBottomInset).toBe(false);
    expect(inner.consumeRightInset).toBe(true);
  });

  it('are still applied by a hidden header, which only gives up the top edge', () => {
    const hidden = resolveEdgeInsetApplication(EMPTY_EDGE_INSETS, {
      headerVisible: false,
    });

    expect(hidden.consumeLeftInset).toBe(true);
    expect(hidden.consumeRightInset).toBe(true);
    expect(hidden.consumeBottomInset).toBe(true);
  });
});

describe('finding the state of the enclosing header', () => {
  const applied: IEdgeInsetState = {
    ...EMPTY_EDGE_INSETS,
    topAlreadyApplied: true,
  };

  it('reads the nearest scope that carries one, passing over navigators that do not', () => {
    const tabScope = { parent: { edgeInsets: applied } };

    expect(findAncestorEdgeInsets(tabScope)).toBe(applied);
  });

  it('prefers the nearest of several', () => {
    const nearer: IEdgeInsetState = { ...applied, leftDisabled: true };

    expect(
      findAncestorEdgeInsets({
        edgeInsets: nearer,
        parent: { edgeInsets: applied },
      }),
    ).toBe(nearer);
  });

  it('starts from nothing applied at the root', () => {
    expect(findAncestorEdgeInsets(undefined)).toBe(EMPTY_EDGE_INSETS);
    expect(findAncestorEdgeInsets({ parent: {} })).toBe(EMPTY_EDGE_INSETS);
  });
});
