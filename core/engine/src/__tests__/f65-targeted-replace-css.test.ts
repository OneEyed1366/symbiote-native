// F-65 (`.docs/tree-inefficiency-findings.md`) measured a 500x cost on the benchmark's Select
// operation, traced to ONE CSS declaration: every example's `.bench-row-selected` rule used to
// carry `border-left-width: 3px` — a Yoga LAYOUT key — alongside the colour change. Toggling it
// dirtied `yogaStyle`, which makes `canReplaceInPlace`'s targeted-replace guard refuse and clone
// the whole list instead of the one row that actually changed. The recommended fix (moving the
// WIDTH onto the always-applied `.bench-row` rule, leaving only the COLOUR on `.bench-row-selected`
// — same look, since the unselected width is just transparent rather than absent) has now been
// applied to every example's stylesheet (`examples/{solid,angular,react,vue-sfc,svelte}` — see each
// one's own comment on `.bench-row`).
//
// This is the regression guard: it proves the STRUCTURAL property the whole mechanism depends on
// — selecting a row must change `borderLeftWidth` in NEITHER direction, only `borderLeftColor` —
// against the actual shipped rule text (a literal copy of examples/solid/screens/
// BenchmarkScreen.css's two rules, the file this session edited first), so a future edit that
// reintroduces the width on the selected rule fails HERE rather than being caught only by another
// 500x device regression nobody is looking for.
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearGlobalStyles,
  createElement,
  flattenStyle,
  getPublishedStyle,
  registerRules,
  routeProp,
} from '../index';

afterEach(() => clearGlobalStyles());

// Byte-identical (properties and values) to examples/solid/screens/BenchmarkScreen.css's
// `.bench-row` / `.bench-row-selected` pair, post-fix.
const ROW_RULE = {
  tokens: ['bench-row'],
  specificity: [0, 1, 0] as [number, number, number],
  order: 0,
  style: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 10,
    paddingRight: 10,
    borderRadius: 8,
    backgroundColor: '#151c33',
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
};
const ROW_SELECTED_RULE = {
  tokens: ['bench-row-selected'],
  specificity: [0, 1, 0] as [number, number, number],
  order: 1,
  style: {
    backgroundColor: '#3a2c10',
    borderLeftColor: '#f5a524',
  },
};

describe('F-65: selecting a benchmark row must not move a Yoga layout key', () => {
  it('keeps borderLeftWidth identical between unselected and selected, changing only the colour', () => {
    registerRules([ROW_RULE, ROW_SELECTED_RULE]);

    const unselected = createElement('RCTView');
    routeProp(unselected, 'class', 'bench-row');
    const unselectedStyle = flattenStyle(getPublishedStyle(unselected));

    const selected = createElement('RCTView');
    routeProp(selected, 'class', 'bench-row bench-row-selected');
    const selectedStyle = flattenStyle(getPublishedStyle(selected));

    expect(selectedStyle.borderLeftWidth).toBe(unselectedStyle.borderLeftWidth);
    expect(selectedStyle.borderLeftWidth).toBe(3);
    expect(unselectedStyle.borderLeftColor).toBe('transparent');
    expect(selectedStyle.borderLeftColor).toBe('#f5a524');
    expect(selectedStyle.backgroundColor).not.toBe(
      unselectedStyle.backgroundColor,
    );
  });
});
