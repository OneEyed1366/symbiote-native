// The aria/role fold, asserted where it MATTERS: the committed Fabric payload, on a node built the
// way a LOWERED element is built — `routeProp` only, no component wrapper, no adapter.
//
// WHY THIS FILE HAD TO EXIST BEFORE THE REFUSAL COULD GO. Four lowering transforms currently refuse
// any element carrying `role` / `aria-*` (`REFUSAL_CATEGORIES.bagFold` in
// `core/components/host-primitives.cjs`), because the fold needs the whole bag and a transform sees
// one attribute at a time. That refusal is the only thing standing between a lowered element and
// silently-lost accessibility, and it costs lowering coverage on every primitive. Deleting it is
// safe exactly once the ENGINE folds — so this asserts the engine does, and it is the gate the
// deletion is allowed to pass.
//
// `core/components/src/accessibility-props.test.ts` covers the fold's own rules in isolation,
// including the two OPPOSITE precedence directions. This one covers the wiring: the sticky node
// flag, the fold running inside `fabricProps`, and the aliases not surviving into the payload.
import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';

import { createElement, createSurface, routeProp } from '../index';

const fabric = installFabric();
let nextRootTag = 7600;

function commitWith(props: Record<string, unknown>) {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  for (const [key, value] of Object.entries(props)) routeProp(node, key, value);
  surface.appendChild(node);
  surface.commit();
  return fabric.appRoot().children[0];
}

describe('the aria fold reaches the committed payload without a wrapper', () => {
  it('folds role into accessibilityRole and drops the alias', () => {
    const committed = commitWith({ role: 'heading' });

    expect(committed.props.accessibilityRole).toBe('header');
    // The alias must not survive: `fabricProps` copies every unknown key through, so a leftover
    // `role` rides to Fabric as a dead prop and shows up in the payload key count.
    expect(Object.hasOwn(committed.props, 'role')).toBe(false);
  });

  it('folds a scalar alias and blanks it', () => {
    const committed = commitWith({ 'aria-label': 'Close' });

    expect(committed.props.accessibilityLabel).toBe('Close');
    expect(Object.hasOwn(committed.props, 'aria-label')).toBe(false);
  });

  // RULE ONE. For every scalar the EXPLICIT prop wins and the alias only fills a hole.
  it('keeps an explicit accessibility prop over its alias', () => {
    const committed = commitWith({
      accessibilityLabel: 'explicit',
      'aria-label': 'alias',
    });

    expect(committed.props.accessibilityLabel).toBe('explicit');
  });

  // RULE TWO, and the reason the fold cannot be simplified: inside a composite the polarity
  // INVERTS and the ALIAS wins per field. A single "explicit wins" rule passes every scalar case
  // above and silently changes this one.
  it('lets an alias override one field of an explicit composite', () => {
    const committed = commitWith({
      accessibilityState: { checked: false, busy: true },
      'aria-checked': true,
    });

    expect(committed.props.accessibilityState).toEqual({
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

    expect(committed.props.nativeID).toBe('plain');
    expect(committed.props.accessible).toBe(true);
    expect(Object.hasOwn(committed.props, 'accessibilityRole')).toBe(false);
  });

  // The gate is a STICKY flag on the node, and an alias written after the first commit has to
  // raise it. A flag set only at construction would make this update commit the raw alias.
  it('folds an alias written after the first commit', () => {
    const surface = createSurface((nextRootTag += 1));
    const node = createElement('RCTView');
    routeProp(node, 'nativeID', 'later');
    surface.appendChild(node);
    surface.commit();

    // The control: the first commit is observed to have landed before the update means anything.
    expect(fabric.appRoot().children[0].props.nativeID).toBe('later');

    routeProp(node, 'aria-busy', true);
    surface.commit();

    const committed = fabric.appRoot().children[0];
    expect(committed.props.accessibilityState).toEqual({
      busy: true,
      checked: undefined,
      disabled: undefined,
      expanded: undefined,
      selected: undefined,
    });
    expect(Object.hasOwn(committed.props, 'aria-busy')).toBe(false);
  });
});
