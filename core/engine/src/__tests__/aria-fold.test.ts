// The aria/role fold, asserted where it MATTERS: the committed Fabric payload, on a node built the
// way a tag is built — `routeProp` only, no component wrapper, no adapter.
//
// The fold needs the whole bag (`aria-checked` is folded against a sibling `accessibilityState`),
// which is why it cannot live anywhere that sees one attribute at a time. Nothing else stands
// between a tag and silently-lost accessibility.
//
// `core/components/src/accessibility-props.test.ts` covers the fold's own rules in isolation,
// including the two OPPOSITE precedence directions. This one covers the wiring: the sticky node
// flag, the fold running inside `fabricProps`, and the aliases not surviving into the payload.
//
// A RECORDING host, and the payload is read from `fabricProps` — which this file's third paragraph
// already names as where the fold runs. It used to be read off a stand-in tree instead, one
// implementation further from the claim and no closer to Fabric. The commits stay: the gate is a
// sticky flag raised on the commit path, so a test that never committed would not exercise it.
import { describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import { createElement, createSurface, propsOf, routeProp } from '../index';
import { fabricProps } from '../fabric-props';
import type { ISymbioteNode } from '../index';

installRecordingFabric();
let nextRootTag = 7600;

function payloadOf(node: ISymbioteNode): Record<string, unknown> {
  return fabricProps(node, propsOf(node));
}

function commitWith(props: Record<string, unknown>) {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  for (const [key, value] of Object.entries(props)) routeProp(node, key, value);
  surface.appendChild(node);
  surface.commit();
  return payloadOf(node);
}

describe('the aria fold reaches the committed payload without a wrapper', () => {
  it('folds role into accessibilityRole and drops the alias', () => {
    const committed = commitWith({ role: 'heading' });

    expect(committed.accessibilityRole).toBe('header');
    // The alias must not survive: `fabricProps` copies every unknown key through, so a leftover
    // `role` rides to Fabric as a dead prop and shows up in the payload key count.
    expect(Object.hasOwn(committed, 'role')).toBe(false);
  });

  it('folds a scalar alias and blanks it', () => {
    const committed = commitWith({ 'aria-label': 'Close' });

    expect(committed.accessibilityLabel).toBe('Close');
    expect(Object.hasOwn(committed, 'aria-label')).toBe(false);
  });

  // RULE ONE. For every scalar the EXPLICIT prop wins and the alias only fills a hole.
  it('keeps an explicit accessibility prop over its alias', () => {
    const committed = commitWith({
      accessibilityLabel: 'explicit',
      'aria-label': 'alias',
    });

    expect(committed.accessibilityLabel).toBe('explicit');
  });

  // RULE TWO, and the reason the fold cannot be simplified: inside a composite the polarity
  // INVERTS and the ALIAS wins per field. A single "explicit wins" rule passes every scalar case
  // above and silently changes this one.
  it('lets an alias override one field of an explicit composite', () => {
    const committed = commitWith({
      accessibilityState: { checked: false, busy: true },
      'aria-checked': true,
    });

    expect(committed.accessibilityState).toEqual({
      busy: true,
      checked: true,
      disabled: undefined,
      expanded: undefined,
      selected: undefined,
    });
  });

  // The control for every assertion above: a node with NO alias must be untouched. Without it a
  // fold that rewrote every payload would still pass the positive cases.
  it('leaves a node carrying no alias alone', () => {
    const committed = commitWith({ nativeID: 'plain', accessible: true });

    expect(committed.nativeID).toBe('plain');
    expect(committed.accessible).toBe(true);
    expect(Object.hasOwn(committed, 'accessibilityRole')).toBe(false);
  });

  // The gate is a STICKY flag on the node, and an alias written after the first commit has to
  // raise it. A flag set only at construction would make this update commit the raw alias.
  it('folds an alias written after the first commit', () => {
    const surface = createSurface((nextRootTag += 1));
    const node = createElement('RCTView');
    routeProp(node, 'nativeID', 'later');
    surface.appendChild(node);
    surface.commit();

    // The control: the first payload is observed to carry the node's own prop before the update
    // means anything. Without it the assertions below could be reading an empty bag.
    expect(payloadOf(node).nativeID).toBe('later');

    routeProp(node, 'aria-busy', true);
    surface.commit();

    const committed = payloadOf(node);
    expect(committed.accessibilityState).toEqual({
      busy: true,
      checked: undefined,
      disabled: undefined,
      expanded: undefined,
      selected: undefined,
    });
    expect(Object.hasOwn(committed, 'aria-busy')).toBe(false);
  });
});
