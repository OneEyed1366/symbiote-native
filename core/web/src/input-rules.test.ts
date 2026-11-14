// Пропсы TextInput с W3C-аналогом: что из них идёт в атрибуты, css и начальное значение

import { describe, expect, it } from 'vitest';
import { domSpecOf } from './dom-spec';
import { initialValueOf, inputRules } from './input-rules';

const SINGLE = 'RCTSinglelineTextInputView';
const MULTI = 'RCTMultilineTextInputView';

const EVERY_INPUT_PROP = {
  text: 'x',
  value: 'x',
  defaultValue: 'x',
  placeholder: 'p',
  placeholderTextColor: 'gray',
  secureTextEntry: true,
  keyboardType: 'numeric',
  inputMode: 'numeric',
  returnKeyType: 'go',
  enterKeyHint: 'go',
  editable: true,
  readOnly: false,
  maxLength: 3,
  autoCapitalize: 'none',
  autoCorrect: false,
  spellCheck: false,
  autoComplete: 'off',
  autoFocus: false,
  blurOnSubmit: true,
  submitBehavior: 'submit',
  selectTextOnFocus: true,
  clearTextOnFocus: true,
  caretHidden: false,
  selectionColor: 'red',
  cursorColor: 'red',
  numberOfLines: 2,
  rows: 2,
  multiline: false,
};

describe('input rules', () => {
  describe('attributes', () => {
    it('writes placeholder, maxLength and the capitalization hint', () => {
      expect(
        inputRules({
          placeholder: 'Name',
          maxLength: 8,
          autoCapitalize: 'words',
        }).attributes,
      ).toEqual({
        placeholder: 'Name',
        maxlength: '8',
        autocapitalize: 'words',
      });
    });

    it('asks the browser to focus the field for autoFocus', () => {
      expect(inputRules({ autoFocus: true }).attributes).toEqual({
        autofocus: '',
      });
    });

    it('leaves focus alone when autoFocus is false', () => {
      expect(inputRules({ autoFocus: false }).attributes).toEqual({});
    });

    it('makes the field a password for secureTextEntry', () => {
      expect(inputRules({ secureTextEntry: true }).attributes).toEqual({
        type: 'password',
      });
    });

    it('is read only, and still focusable, when not editable', () => {
      expect(inputRules({ editable: false }).attributes).toEqual({
        readonly: '',
      });
      expect(inputRules({ readOnly: true }).attributes).toEqual({
        readonly: '',
      });
      expect(inputRules({ editable: true }).attributes).toEqual({});
    });

    it('writes autocorrect, spellcheck and autocomplete', () => {
      expect(
        inputRules({
          autoCorrect: false,
          spellCheck: true,
          autoComplete: 'email',
        }).attributes,
      ).toEqual({
        autocorrect: 'off',
        spellcheck: 'true',
        autocomplete: 'email',
      });
    });

    it('sets the row count of a multiline field', () => {
      expect(inputRules({ numberOfLines: 4 }).attributes).toEqual({
        rows: '4',
      });
      expect(inputRules({ rows: 6, numberOfLines: 4 }).attributes).toEqual({
        rows: '6',
      });
    });
  });

  describe('keyboard', () => {
    it.each([
      ['numeric', 'numeric'],
      ['number-pad', 'numeric'],
      ['decimal-pad', 'decimal'],
      ['phone-pad', 'tel'],
      ['email-address', 'email'],
      ['url', 'url'],
      ['web-search', 'search'],
    ])('maps keyboardType %s to inputmode %s', (keyboardType, mode) => {
      expect(inputRules({ keyboardType }).attributes).toEqual({
        inputmode: mode,
      });
    });

    it('lets the web spelling win over keyboardType', () => {
      expect(
        inputRules({ inputMode: 'email', keyboardType: 'numeric' }).attributes,
      ).toEqual({ inputmode: 'email' });
    });

    it('leaves the default keyboard to the browser', () => {
      expect(inputRules({ keyboardType: 'default' }).attributes).toEqual({});
    });

    it('maps the return key', () => {
      expect(inputRules({ returnKeyType: 'go' }).attributes).toEqual({
        enterkeyhint: 'go',
      });
      expect(
        inputRules({ enterKeyHint: 'next', returnKeyType: 'go' }).attributes,
      ).toEqual({
        enterkeyhint: 'next',
      });
      expect(inputRules({ returnKeyType: 'default' }).attributes).toEqual({});
    });
  });

  describe('css', () => {
    it('keeps the placeholder color in a custom property the reset sheet reads', () => {
      expect(inputRules({ placeholderTextColor: 'gray' }).css).toEqual({
        '--sn-placeholder-color': 'gray',
      });
    });

    it('hides or colors the caret', () => {
      expect(inputRules({ caretHidden: true }).css).toEqual({
        'caret-color': 'transparent',
      });
      expect(inputRules({ selectionColor: 'red' }).css).toEqual({
        'caret-color': 'red',
      });
      expect(
        inputRules({ cursorColor: 'blue', selectionColor: 'red' }).css,
      ).toEqual({
        'caret-color': 'blue',
      });
    });
  });

  describe('initial value', () => {
    it('reads text, then value, then defaultValue', () => {
      expect(initialValueOf({ text: 'a', value: 'b', defaultValue: 'c' })).toBe(
        'a',
      );
      expect(initialValueOf({ value: 'b', defaultValue: 'c' })).toBe('b');
      expect(initialValueOf({ defaultValue: 'c' })).toBe('c');
      expect(initialValueOf({})).toBeUndefined();
    });
  });

  describe('through the element spec', () => {
    it('applies to both input views and to no other', () => {
      const props = { placeholder: 'Name', text: 'x' };

      expect(domSpecOf(SINGLE, props).attributes.placeholder).toBe('Name');
      expect(domSpecOf(MULTI, props).attributes.placeholder).toBe('Name');
      expect(
        domSpecOf('RCTView', props).attributes.placeholder,
      ).toBeUndefined();
    });

    it('does not report the input props as skipped', () => {
      const skipped: string[] = [];

      domSpecOf(SINGLE, EVERY_INPUT_PROP, key => skipped.push(key));

      expect(skipped).toEqual([]);
    });
  });
});
