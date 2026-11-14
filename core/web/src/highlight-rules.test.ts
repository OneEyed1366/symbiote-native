// TouchableHighlight shows its underlay while pressed: the box takes the underlay color and its
// single child dims. Both go over the app's style, or a box with a background would not respond

import { describe, expect, it } from 'vitest';
import { domSpecOf } from './dom-spec';

const VIEW = 'RCTView';
const PRESSED = { isActive: true, hasColor: false };

const boxOf = (bag: Record<string, unknown>) =>
  domSpecOf(VIEW, bag, undefined, 'touchable-highlight').css;

const childOf = (bag: Record<string, unknown>) =>
  domSpecOf(VIEW, bag, undefined, '').css;

describe('touchable highlight', () => {
  describe('the box', () => {
    it('keeps its own background while the underlay is hidden', () => {
      const css = boxOf({
        backgroundColor: 'red',
        underlay: { isActive: false },
      });

      expect(css['background-color']).toBe('red');
    });

    it('shows black over its own background while pressed', () => {
      const css = boxOf({ backgroundColor: 'red', underlay: PRESSED });

      expect(css['background-color']).toBe('black');
    });

    it('shows the underlay color the app gave', () => {
      const underlay = { isActive: true, hasColor: true, color: 'gold' };

      expect(boxOf({ underlay })['background-color']).toBe('gold');
    });

    it('shows no tint for a null underlay color, which is how an app asks for none', () => {
      const underlay = { isActive: true, hasColor: true, color: null };

      expect(
        boxOf({ backgroundColor: 'red', underlay })['background-color'],
      ).toBe('red');
    });

    it('does not report the underlay as skipped', () => {
      const skipped: string[] = [];

      domSpecOf(
        VIEW,
        { underlay: PRESSED },
        key => skipped.push(key),
        'touchable-highlight',
      );

      expect(skipped).toEqual([]);
    });
  });

  describe('the child', () => {
    it('dims over its own opacity while the owner is pressed', () => {
      const css = childOf({ opacity: 1, highlightChild: { opacity: 0.85 } });

      expect(css.opacity).toBe('0.85');
    });

    it('keeps its own opacity while the owner is not pressed', () => {
      expect(childOf({ opacity: 0.5 }).opacity).toBe('0.5');
    });

    it('does not report the owner bit as skipped', () => {
      const skipped: string[] = [];

      domSpecOf(VIEW, { highlightChild: { opacity: 0.5 } }, key =>
        skipped.push(key),
      );

      expect(skipped).toEqual([]);
    });
  });
});
