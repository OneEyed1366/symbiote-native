// RN has no `value` Fabric prop. A TextInput's controlled value rides as the private `text` prop,
// and the fold that produces it — `value ?? defaultValue` — used to live only in the component
// WRAPPER. A lowered element has no wrapper, so a transform printing the author's `value={x}` would
// hand Fabric a key no ViewConfig declares: silently dropped, `text` never set, the field renders
// empty. Every test green, device only.
//
// The fold now runs in `fabricProps`, so this asserts the COMMITTED payload on a node built the way
// a lowered element is — `routeProp` only, no wrapper, no adapter. Asserting `node.props` would be
// the wrong end of the chain: the authored shape deliberately keeps `value`, and only the payload
// says what native receives.
import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';

import { createElement, createSurface, routeProp } from '../index';

const fabric = installFabric();
let nextRootTag = 7800;

const SINGLELINE = 'RCTSinglelineTextInputView';
const MULTILINE = 'RCTMultilineTextInputView';

function commitWith(component: string, props: Record<string, unknown>) {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement(component);
  for (const [key, value] of Object.entries(props)) routeProp(node, key, value);
  surface.appendChild(node);
  surface.commit();
  return fabric.appRoot().children[0];
}

describe('a TextInput value reaches Fabric as text', () => {
  it('folds value into text and drops the alias', () => {
    const committed = commitWith(SINGLELINE, { value: 'typed' });

    expect(committed.props.text).toBe('typed');
    // `value` is not a Fabric prop, so a surviving key rides to native as dead weight and shows up
    // in the payload key count.
    expect(Object.hasOwn(committed.props, 'value')).toBe(false);
  });

  it('folds defaultValue when there is no value', () => {
    const committed = commitWith(SINGLELINE, { defaultValue: 'preset' });

    expect(committed.props.text).toBe('preset');
    expect(Object.hasOwn(committed.props, 'defaultValue')).toBe(false);
  });

  // `foldText`'s rule, kept identical rather than re-derived: an uncontrolled default is only a
  // fallback, and a controlled value that happens to be empty still wins over it.
  it('lets value win over defaultValue', () => {
    const committed = commitWith(SINGLELINE, {
      value: 'controlled',
      defaultValue: 'preset',
    });

    expect(committed.props.text).toBe('controlled');
  });

  it('applies to the multiline view too', () => {
    const committed = commitWith(MULTILINE, { value: 'lines' });

    expect(committed.props.text).toBe('lines');
  });

  // The COMPONENT path: the wrapper folded already and sets `text` alone. Re-folding there would
  // let a stale `value` overwrite what the wrapper computed.
  it('leaves an explicit text alone', () => {
    const committed = commitWith(SINGLELINE, {
      text: 'from the wrapper',
      value: 'stale',
    });

    expect(committed.props.text).toBe('from the wrapper');
  });

  // THE CONTROL, and the reason the fold is keyed on the COMPONENT rather than on the prop name:
  // `value` is an ordinary prop of Switch and Slider, and a fold that fired on the name alone would
  // write a bogus `text` onto both.
  it('does NOT fold value on a view that is not a text input', () => {
    const committed = commitWith('Switch', { value: true });

    expect(committed.props.value).toBe(true);
    expect(Object.hasOwn(committed.props, 'text')).toBe(false);
  });
});
