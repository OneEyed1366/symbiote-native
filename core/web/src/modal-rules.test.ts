// A Modal host covers the page and sits above it, as the native window does. Upstream gives the
// host `position: absolute` and lets the platform size it to the screen, so the page pins it itself

import { describe, expect, it } from 'vitest';
import { domSpecOf } from './dom-spec';

const MODAL = 'ModalHostView';

const specOf = (bag: Record<string, unknown> = {}) =>
  domSpecOf(MODAL, bag, undefined, 'modal');

describe('modal rules', () => {
  it('covers the whole page above everything, whatever position the app style asked for', () => {
    expect(specOf({ position: 'absolute' }).css).toMatchObject({
      position: 'fixed',
      top: '0px',
      right: '0px',
      bottom: '0px',
      left: '0px',
      'z-index': '1000',
    });
  });

  it('is a dialog that holds the focus of the page below it', () => {
    expect(specOf().attributes).toMatchObject({
      role: 'dialog',
      'aria-modal': 'true',
    });
  });

  it('keeps the other style keys of the app', () => {
    expect(specOf({ backgroundColor: 'red' }).css['background-color']).toBe(
      'red',
    );
  });

  it('plays the entrance its animationType names and none for none', () => {
    expect([
      specOf({ animationType: 'fade' }).classNames,
      specOf({ animationType: 'slide' }).classNames,
      specOf({ animationType: 'none' }).classNames,
    ]).toEqual([
      expect.arrayContaining(['sn-modal-fade']),
      expect.arrayContaining(['sn-modal-slide']),
      expect.not.arrayContaining(['sn-modal-fade', 'sn-modal-slide']),
    ]);
  });

  it('does not report the native window props as skipped', () => {
    const skipped: string[] = [];
    domSpecOf(
      MODAL,
      {
        transparent: true,
        animationType: 'none',
        presentationStyle: 'fullScreen',
        supportedOrientations: ['portrait'],
        hardwareAccelerated: false,
        statusBarTranslucent: true,
        navigationBarTranslucent: true,
        allowSwipeDismissal: true,
        visible: true,
      },
      key => skipped.push(key),
      'modal',
    );

    expect(skipped).toEqual([]);
  });
});
