// Which of two spellings of one accessibility fact the page hears: the aria alias beats the
// canonical prop, a direct `disabled` beats the state, and a Button reads its own labels as RN does

import { describe, expect, it } from 'vitest';
import { domSpecOf } from './dom-spec';

const VIEW = 'RCTView';

const attributesOf = (
  tagName: string,
  bag: Record<string, unknown>,
): Record<string, string> =>
  domSpecOf(VIEW, bag, undefined, tagName).attributes;

describe('aria alias precedence', () => {
  it('lets aria-label beat accessibilityLabel whatever the key order', () => {
    const aliasLast = { accessibilityLabel: 'plain', 'aria-label': 'alias' };
    const aliasFirst = { 'aria-label': 'alias', accessibilityLabel: 'plain' };
    expect(attributesOf('', aliasLast)['aria-label']).toBe('alias');
    expect(attributesOf('', aliasFirst)['aria-label']).toBe('alias');
  });

  it('lets aria-disabled beat the disabled state whatever the key order', () => {
    const stateLast = {
      'aria-disabled': false,
      accessibilityState: { disabled: true },
    };
    const stateFirst = {
      accessibilityState: { disabled: true },
      'aria-disabled': false,
    };
    expect(attributesOf('', stateLast)['aria-disabled']).toBe('false');
    expect(attributesOf('', stateFirst)['aria-disabled']).toBe('false');
  });
});

describe('disabled on a pressable', () => {
  it('beats the disabled field of the state', () => {
    const bag = { disabled: true, accessibilityState: { disabled: false } };
    expect(attributesOf('pressable', bag)['aria-disabled']).toBe('true');
  });

  it('keeps the other fields of the state it folds into', () => {
    const bag = { disabled: true, accessibilityState: { checked: true } };
    const attributes = attributesOf('pressable', bag);
    expect(attributes['aria-disabled']).toBe('true');
    expect(attributes['aria-checked']).toBe('true');
  });

  it('loses to an aria-disabled the app wrote', () => {
    const bag = { disabled: true, 'aria-disabled': false };
    expect(attributesOf('pressable', bag)['aria-disabled']).toBe('false');
  });
});

describe('the labels of a Button', () => {
  it('falls through an empty aria-label to the plain label', () => {
    const bag = { 'aria-label': '', accessibilityLabel: 'Save' };
    expect(attributesOf('button', bag)['aria-label']).toBe('Save');
  });

  it('writes no label when both are empty or missing', () => {
    expect(
      attributesOf('button', { 'aria-label': '' })['aria-label'],
    ).toBeUndefined();
  });

  it('keeps a non-empty aria-label over the plain one', () => {
    const bag = { 'aria-label': 'Alias', accessibilityLabel: 'Save' };
    expect(attributesOf('button', bag)['aria-label']).toBe('Alias');
  });

  it('hides its descendants from a screen reader when it is not important', () => {
    expect(
      attributesOf('button', { importantForAccessibility: 'no' })[
        'aria-hidden'
      ],
    ).toBe('true');
  });

  it('leaves a plain view with importantForAccessibility no unhidden', () => {
    expect(
      attributesOf('', { importantForAccessibility: 'no' })['aria-hidden'],
    ).toBeUndefined();
  });
});
