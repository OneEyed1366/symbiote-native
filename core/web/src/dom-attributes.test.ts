// Plain props of a Fabric payload bag become DOM attributes. A prop with no DOM meaning writes
// nothing, and is reported so a dropped prop stays visible

import { describe, expect, it } from 'vitest';
import { attributesFromBag } from './dom-attributes';

describe('attributes from a payload bag', () => {
  describe('identity', () => {
    it('writes testID as data-testid and nativeID as id', () => {
      expect(attributesFromBag({ testID: 'row', nativeID: 'a' })).toEqual({
        'data-testid': 'row',
        id: 'a',
      });
    });
  });

  describe('accessibility', () => {
    it('writes the label, hint and role', () => {
      expect(
        attributesFromBag({
          accessibilityLabel: 'Close',
          accessibilityHint: 'Closes the sheet',
          accessibilityRole: 'button',
        }),
      ).toEqual({
        'aria-label': 'Close',
        'aria-description': 'Closes the sheet',
        role: 'button',
      });
    });

    it('renames the roles the web calls differently', () => {
      expect(attributesFromBag({ accessibilityRole: 'header' })).toEqual({
        role: 'heading',
      });
      expect(attributesFromBag({ role: 'image' })).toEqual({ role: 'img' });
      expect(attributesFromBag({ role: 'none' })).toEqual({
        role: 'presentation',
      });
    });

    it('spreads accessibilityState over aria states', () => {
      expect(
        attributesFromBag({
          accessibilityState: { disabled: true, checked: 'mixed', busy: false },
        }),
      ).toEqual({
        'aria-disabled': 'true',
        'aria-checked': 'mixed',
        'aria-busy': 'false',
      });
    });

    it('spreads accessibilityValue over aria values', () => {
      expect(
        attributesFromBag({
          accessibilityValue: { min: 0, max: 10, now: 4, text: 'four' },
        }),
      ).toEqual({
        'aria-valuemin': '0',
        'aria-valuemax': '10',
        'aria-valuenow': '4',
        'aria-valuetext': 'four',
      });
    });

    it('passes aria-* props through as strings', () => {
      expect(
        attributesFromBag({ 'aria-expanded': true, 'aria-label': 'x' }),
      ).toEqual({
        'aria-expanded': 'true',
        'aria-label': 'x',
      });
    });

    it('hides a subtree from assistive tech', () => {
      expect(attributesFromBag({ accessibilityElementsHidden: true })).toEqual({
        'aria-hidden': 'true',
      });
      expect(
        attributesFromBag({ importantForAccessibility: 'no-hide-descendants' }),
      ).toEqual({ 'aria-hidden': 'true' });
    });

    it('maps the live region, where RN says none the web says off', () => {
      expect(attributesFromBag({ accessibilityLiveRegion: 'polite' })).toEqual({
        'aria-live': 'polite',
      });
      expect(attributesFromBag({ accessibilityLiveRegion: 'none' })).toEqual({
        'aria-live': 'off',
      });
    });
  });

  describe('focus', () => {
    it('makes a focusable view reachable by keyboard and a non-focusable one not', () => {
      expect(attributesFromBag({ focusable: true })).toEqual({ tabindex: '0' });
      expect(attributesFromBag({ focusable: false })).toEqual({
        tabindex: '-1',
      });
    });
  });

  describe('props with no DOM meaning', () => {
    it('reports each one once and writes nothing', () => {
      const skipped: string[] = [];
      const attributes = attributesFromBag(
        { collapsable: false, hitSlop: 4 },
        key => skipped.push(key),
      );

      expect(attributes).toEqual({});
      expect(skipped).toEqual(['collapsable', 'hitSlop']);
    });

    it('does not report a style key, which the style side owns', () => {
      const skipped: string[] = [];
      attributesFromBag({ width: 3 }, key => skipped.push(key));

      expect(skipped).toEqual([]);
    });
  });
});
