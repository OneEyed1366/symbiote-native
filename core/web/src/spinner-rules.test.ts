// An ActivityIndicator is a centering view around a spinner (`ActivityIndicator.js`). Upstream's
// iOS spinner is gray, 20px small or 36px large, and a stopped one is hidden unless told otherwise

import { describe, expect, it } from 'vitest';
import { domSpecOf } from './dom-spec';

const VIEW = 'RCTView';
const HOST_TAG = 'activity-indicator';
const SPINNER_TAG = 'activity-indicator-spinner';

const hostOf = (bag: Record<string, unknown> = {}) =>
  domSpecOf(VIEW, bag, undefined, HOST_TAG);
const spinnerOf = (bag: Record<string, unknown> = {}) =>
  domSpecOf(VIEW, bag, undefined, SPINNER_TAG);

describe('spinner rules', () => {
  describe('the centering view', () => {
    it('centers the spinner inside the space it was given', () => {
      expect(hostOf().css).toMatchObject({
        'align-items': 'center',
        'justify-content': 'center',
      });
    });

    it('lets the style of the app beat the centering', () => {
      expect(hostOf({ alignItems: 'flex-start' }).css['align-items']).toBe(
        'flex-start',
      );
    });
  });

  describe('the spinner', () => {
    it('is a gray 20px ring that turns and announces itself as a progress bar', () => {
      const spec = spinnerOf();

      expect(spec.classNames).toContain('sn-spinner');
      expect(spec.css).toMatchObject({
        width: '20px',
        height: '20px',
        'border-color': '#999999',
        'border-top-color': 'transparent',
      });
      expect(spec.attributes.role).toBe('progressbar');
    });

    it('is 36px for the large size and as wide as a number says', () => {
      expect([
        spinnerOf({ size: 'large' }).css.width,
        spinnerOf({ size: 50 }).css.height,
      ]).toEqual(['36px', '50px']);
    });

    it('takes the color of the app', () => {
      expect(spinnerOf({ color: 'tomato' }).css['border-color']).toBe('tomato');
    });

    it('hides a stopped spinner', () => {
      expect(spinnerOf({ animating: false }).css.display).toBe('none');
    });

    it('keeps a stopped spinner that is told not to hide, standing still', () => {
      const css = spinnerOf({ animating: false, hidesWhenStopped: false }).css;

      expect(css.display).toBeUndefined();
      expect(css['animation-play-state']).toBe('paused');
    });

    it('does not report its own props as skipped', () => {
      const skipped: string[] = [];
      domSpecOf(
        VIEW,
        {
          size: 'large',
          color: 'red',
          animating: true,
          hidesWhenStopped: true,
        },
        key => skipped.push(key),
        SPINNER_TAG,
      );

      expect(skipped).toEqual([]);
    });
  });
});
