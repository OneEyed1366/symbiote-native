// A Switch is a native control, so the page draws a pill with a thumb the way iOS does: green when
// on, light gray when off, half faded while disabled. Colors come from the props RN's Switch takes

import { describe, expect, it } from 'vitest';
import { domSpecOf } from './dom-spec';

const VIEW = 'RCTView';
const GREEN = '#34C759';
const LIGHT_GRAY = '#E9E9EA';

const specOf = (bag: Record<string, unknown> = {}) =>
  domSpecOf(VIEW, bag, undefined, 'switch');

describe('switch rules', () => {
  it('is a switch for assistive technology, checked as its value says', () => {
    expect([
      specOf({ value: true }).attributes,
      specOf({}).attributes,
    ]).toMatchObject([
      { role: 'switch', 'aria-checked': 'true', tabindex: '0' },
      { role: 'switch', 'aria-checked': 'false' },
    ]);
  });

  it('paints the track green when on and light gray when off', () => {
    expect([
      specOf({ value: true }).css['background-color'],
      specOf({ value: false }).css['background-color'],
    ]).toEqual([GREEN, LIGHT_GRAY]);
  });

  it('takes the track colors of the app for each state', () => {
    const trackColor = { true: 'navy', false: 'pink' };

    expect([
      specOf({ value: true, trackColor }).css['background-color'],
      specOf({ value: false, trackColor }).css['background-color'],
    ]).toEqual(['navy', 'pink']);
  });

  it('lets the iOS background beat the off color of the track', () => {
    expect(
      specOf({ trackColor: { false: 'pink' }, ios_backgroundColor: 'plum' })
        .css['background-color'],
    ).toBe('plum');
  });

  it('hands the thumb color to the class that draws the thumb', () => {
    const spec = specOf({ thumbColor: 'gold' });

    expect(spec.classNames).toContain('sn-switch');
    expect(spec.css['--sn-switch-thumb']).toBe('gold');
  });

  it('fades a disabled switch and takes it out of the tab order', () => {
    const spec = specOf({ disabled: true });

    expect(spec.css.opacity).toBe('0.5');
    expect(spec.attributes).toMatchObject({ 'aria-disabled': 'true' });
    expect(spec.attributes.tabindex).toBeUndefined();
  });

  it('does not report its own props as skipped', () => {
    const skipped: string[] = [];
    domSpecOf(
      VIEW,
      {
        value: true,
        disabled: false,
        trackColor: { true: 'navy' },
        thumbColor: 'gold',
        ios_backgroundColor: 'plum',
      },
      key => skipped.push(key),
      'switch',
    );

    expect(skipped).toEqual([]);
  });
});
