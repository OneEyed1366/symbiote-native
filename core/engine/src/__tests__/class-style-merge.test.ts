// routeProp's centralized class+style merge (core/engine/src/node.ts): every adapter's
// `class`/`className`/`style` prop funnels through here, so a class registered by the SFC/CSS
// style compiler resolves identically for React (className), Vue (class), and Angular
// (addClass/removeClass, which joins its own token set into one string before calling
// routeProp — see adapters/angular/src/renderer.ts). Explicit `style` must always win over a
// class-derived one, regardless of which prop is set first or last.

import { afterEach, describe, expect, it } from 'vitest';
import {
  clearGlobalStyles,
  createElement,
  flattenStyle,
  getExplicitStyle,
  registerStyles,
  routeProp,
} from '../index';

afterEach(() => clearGlobalStyles());

// routeProp's class/style merge has no throwing path (an invalid class value degrades to "no
// class-derived style" rather than a throw — see the last test below), so scenarios are grouped
// by the merge outcome they prove rather than Positive/Negative. isClassNameValue/
// resolveClassName's OWN branch coverage (compound lookups, scoped-token matching, array/object
// class values, kebab->camel fallback) lives in style-registry/style-registry.test.ts — this
// file's scope is specifically node.ts's [classStyle, explicitStyle] merge/precedence logic.
describe('routeProp class/className + style merge', () => {
  it('resolves a class name against the shared style registry', () => {
    registerStyles({ card: { padding: 10 } });
    const node = createElement('RCTView');

    routeProp(node, 'class', 'card');

    expect(flattenStyle(node.props.style)).toEqual({ padding: 10 });
  });

  // why: Vue templates author `class`, React JSX authors `className` — both must resolve through
  // the SAME registry entry, or the same CSS class would style a Vue node differently than a
  // React one.
  it('resolves className identically to class (React idiom, same registry)', () => {
    registerStyles({ card: { padding: 10 } });
    const node = createElement('RCTView');

    routeProp(node, 'className', 'card');

    expect(flattenStyle(node.props.style)).toEqual({ padding: 10 });
  });

  // why: an inline `style` prop is the more specific, more local override — it must always win
  // over a class-derived style regardless of call order, since Vue/Angular fire class and style
  // as two separate calls that can land in either order across a re-render.
  it('lets an explicit style win over class-derived style, class set first', () => {
    registerStyles({ card: { padding: 10, backgroundColor: 'red' } });
    const node = createElement('RCTView');

    routeProp(node, 'class', 'card');
    routeProp(node, 'style', { backgroundColor: 'blue' });

    expect(flattenStyle(node.props.style)).toEqual({ padding: 10, backgroundColor: 'blue' });
  });

  it('lets an explicit style win over class-derived style, style set first', () => {
    registerStyles({ card: { padding: 10, backgroundColor: 'red' } });
    const node = createElement('RCTView');

    routeProp(node, 'style', { backgroundColor: 'blue' });
    routeProp(node, 'class', 'card');

    expect(flattenStyle(node.props.style)).toEqual({ padding: 10, backgroundColor: 'blue' });
  });

  // why: the two halves are tracked independently in a WeakMap so either can update without
  // clobbering the other — removing the class must re-derive the merge from the SURVIVING
  // explicit half, not leave a stale class contribution behind.
  it('recomputes the merge when the class is later removed', () => {
    registerStyles({ card: { padding: 10 } });
    const node = createElement('RCTView');

    routeProp(node, 'class', 'card');
    routeProp(node, 'style', { backgroundColor: 'blue' });
    routeProp(node, 'class', undefined);

    expect(flattenStyle(node.props.style)).toEqual({ backgroundColor: 'blue' });
  });

  // why: an adapter building style prop-by-prop (Angular's Ivy ɵɵstyleProp) must merge onto the
  // explicit half specifically, not onto node.props.style directly (which may already be the
  // [classStyle, explicitStyle] tuple) — getExplicitStyle is that seam.
  it('exposes the explicit style half via getExplicitStyle, unaffected by class', () => {
    registerStyles({ card: { padding: 10 } });
    const node = createElement('RCTView');

    routeProp(node, 'style', { backgroundColor: 'blue' });
    routeProp(node, 'class', 'card');

    expect(getExplicitStyle(node)).toEqual({ backgroundColor: 'blue' });
  });

  // why: `class`/`className` cross the routeProp boundary as `unknown` — an adapter could hand
  // over a non-string, non-object value (a stray number, a boolean) by accident. The merge must
  // treat it as "no class-derived style" rather than let a rejected value corrupt the tuple or
  // crash the commit, and the explicit style half must still apply on top of it.
  it('an invalid class value (rejected by isClassNameValue) contributes no style', () => {
    const node = createElement('RCTView');

    routeProp(node, 'class', 42);
    routeProp(node, 'style', { backgroundColor: 'blue' });

    expect(flattenStyle(node.props.style)).toEqual({ backgroundColor: 'blue' });
  });
});
