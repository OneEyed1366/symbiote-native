// The user-agent half of a pressable, as the C++ rule gives it to a native view: it can be focused
// and announced as a control unless the app says otherwise, and a disabled one says so

import { TEXT_COMPONENT } from '@symbiote-native/engine';
import { describe, expect, it } from 'vitest';
import { domSpecOf } from './dom-spec';

const VIEW = 'RCTView';

const attributesOf = (
  tagName: string,
  bag: Record<string, unknown>,
  viewName = VIEW,
): Record<string, string> =>
  domSpecOf(viewName, bag, undefined, tagName).attributes;

describe('pressable rules', () => {
  describe('a bare pressable', () => {
    it('is a focusable button by default', () => {
      expect(attributesOf('pressable', {})).toEqual({
        role: 'button',
        tabindex: '0',
      });
    });

    it('leaves the focus order when focusable is false', () => {
      expect(attributesOf('pressable', { focusable: false }).tabindex).toBe(
        '-1',
      );
    });

    it('keeps the role the app wrote', () => {
      expect(
        attributesOf('pressable', { accessibilityRole: 'link' }).role,
      ).toBe('link');
    });

    it('announces disabled, and says so for an explicit enabled too', () => {
      expect(
        attributesOf('pressable', { disabled: true })['aria-disabled'],
      ).toBe('true');
      expect(
        attributesOf('pressable', { disabled: false })['aria-disabled'],
      ).toBe('false');
    });

    it('announces nothing about disabled when the app never said', () => {
      expect(attributesOf('pressable', {})['aria-disabled']).toBeUndefined();
    });
  });

  describe('a touchable', () => {
    it('is focusable only with a press listener', () => {
      expect(attributesOf('touchable-opacity', {}).tabindex).toBe('-1');
      expect(
        attributesOf('touchable-opacity', { hasPressListener: true }).tabindex,
      ).toBe('0');
    });

    it('is not focusable while disabled', () => {
      const bag = { hasPressListener: true, disabled: true };

      expect(attributesOf('touchable-highlight', bag).tabindex).toBe('-1');
    });
  });

  describe('button and checkbox', () => {
    it('gives a button the role button and a press-gated focus', () => {
      expect(attributesOf('button', { hasPressListener: true })).toEqual({
        role: 'button',
        tabindex: '0',
      });
      expect(attributesOf('button', {}).tabindex).toBe('-1');
    });

    it('gives a checkbox the role checkbox', () => {
      expect(attributesOf('checkbox', {}).role).toBe('checkbox');
    });
  });

  describe('props the machine consumes', () => {
    it('are not reported as skipped', () => {
      const bag = {
        hasPressListener: true,
        disabled: false,
        focusable: true,
        accessible: true,
        android_ripple: {},
        cancelable: true,
        delayLongPress: 1,
        minPressDuration: 1,
        unstable_pressDelay: 1,
        pressRetentionOffset: 1,
        delayHoverIn: 1,
        delayHoverOut: 1,
        android_disableSound: true,
        blockNativeResponder: true,
        testOnly_pressed: true,
        activeOpacity: 0.5,
        underlayColor: 'red',
        delayPressIn: 1,
        delayPressOut: 1,
        touchSoundDisabled: true,
        rejectResponderTermination: true,
      };

      const skipped: string[] = [];
      domSpecOf(VIEW, bag, key => skipped.push(key), 'touchable-highlight');

      expect(skipped).toEqual([]);
    });
  });

  describe('a pressable text', () => {
    it('is a focusable link', () => {
      expect(
        attributesOf('text', { hasPressListener: true }, TEXT_COMPONENT),
      ).toEqual({ role: 'link', tabindex: '0' });
    });

    it('is a plain text without a press listener', () => {
      expect(attributesOf('text', {}, TEXT_COMPONENT)).toEqual({});
    });

    it('is a plain text while disabled', () => {
      const bag = { hasPressListener: true, disabled: true };

      expect(attributesOf('text', bag, TEXT_COMPONENT)).toEqual({
        'aria-disabled': 'true',
      });
    });

    it('keeps the role the app wrote', () => {
      const bag = { hasPressListener: true, accessibilityRole: 'button' };

      expect(attributesOf('text', bag, TEXT_COMPONENT).role).toBe('button');
    });
  });
});
