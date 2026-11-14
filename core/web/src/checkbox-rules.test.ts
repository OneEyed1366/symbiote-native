// A checkbox is a pressable with a look of its own (`ExpoCheckbox.tsx`): a bordered box that fills
// when checked, tints with `color`, greys while disabled. The order upstream composes its style in
// is base, the app's style, checked, tint, disabled, so each later step beats the app's own style

import { describe, expect, it } from 'vitest';
import { domSpecOf } from './dom-spec';

const VIEW = 'RCTView';
const BLUE = '#007AFF';

const specOf = (bag: Record<string, unknown>, tagName = 'checkbox') =>
  domSpecOf(VIEW, bag, undefined, tagName);

describe('checkbox rules', () => {
  describe('the box', () => {
    it('is a bordered 20px square', () => {
      expect(specOf({}).css).toMatchObject({
        width: '20px',
        height: '20px',
        'border-radius': '2px',
        'border-width': '2px',
        'border-color': '#657786',
      });
    });

    it('fills with the platform blue when checked', () => {
      expect(specOf({ value: true }).css).toMatchObject({
        'background-color': BLUE,
        'border-color': BLUE,
      });
    });

    it('keeps the background of the app while unchecked', () => {
      expect(specOf({ backgroundColor: 'red' }).css['background-color']).toBe(
        'red',
      );
    });

    it('lets checked beat the background of the app', () => {
      const css = specOf({ backgroundColor: 'red', value: true }).css;

      expect(css['background-color']).toBe(BLUE);
    });

    it('lets the app size the box', () => {
      expect(specOf({ width: 30 }).css.width).toBe('30px');
    });
  });

  describe('tint', () => {
    it('colors the border of an unchecked box', () => {
      const css = specOf({ color: 'tomato' }).css;

      expect(css['border-color']).toBe('tomato');
      expect(css['background-color']).toBeUndefined();
    });

    it('colors border and fill of a checked box', () => {
      expect(specOf({ color: 'tomato', value: true }).css).toMatchObject({
        'border-color': 'tomato',
        'background-color': 'tomato',
      });
    });

    it('takes an empty tint for none', () => {
      expect(specOf({ color: '' }).css['border-color']).toBe('#657786');
    });
  });

  describe('disabled', () => {
    it('greys the border and clears the fill', () => {
      expect(specOf({ disabled: true }).css).toMatchObject({
        'border-color': '#CCD6DD',
        'background-color': 'transparent',
      });
    });

    it('darkens a checked box that is disabled', () => {
      expect(specOf({ disabled: true, value: true }).css).toMatchObject({
        'border-color': '#AAB8C2',
        'background-color': '#AAB8C2',
      });
    });

    it('reads the disabled prop alone, as the C++ rule does', () => {
      const looksEnabled = [
        specOf({ 'aria-disabled': true }).css['border-color'],
        specOf({ accessibilityState: { disabled: true } }).css['border-color'],
      ];

      expect(looksEnabled).toEqual(['#657786', '#657786']);
    });
  });

  describe('announcement', () => {
    it('says checked for value', () => {
      expect(specOf({ value: true }).attributes['aria-checked']).toBe('true');
      expect(specOf({ value: false }).attributes['aria-checked']).toBe('false');
    });

    it('says nothing without a value', () => {
      expect(specOf({}).attributes['aria-checked']).toBeUndefined();
    });

    it('keeps the aria-checked the app wrote', () => {
      const bag = { value: true, 'aria-checked': 'mixed' };

      expect(specOf(bag).attributes['aria-checked']).toBe('mixed');
    });

    it('does not report value or color as skipped', () => {
      const skipped: string[] = [];

      domSpecOf(
        VIEW,
        { value: true, color: 'red' },
        key => skipped.push(key),
        'checkbox',
      );

      expect(skipped).toEqual([]);
    });
  });

  describe('the check mark', () => {
    it('fills the box and shows once the owner is checked', () => {
      const css = specOf(
        { checkboxOwner: { isChecked: true } },
        'checkbox-mark',
      ).css;

      expect(css.position).toBe('absolute');
      expect(css.display).toBeUndefined();
    });

    it('hides while the owner is unchecked', () => {
      const css = specOf(
        { checkboxOwner: { isChecked: false } },
        'checkbox-mark',
      ).css;

      expect(css.display).toBe('none');
    });
  });
});
