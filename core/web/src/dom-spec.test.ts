// What one node asks of its element: a class from the reset sheet, inline CSS and attributes

import { describe, expect, it } from 'vitest';
import { domSpecOf } from './dom-spec';
import { CLASS_NAMES } from './reset-sheet';

describe('element spec of a node', () => {
  it('gives each view family its reset class', () => {
    expect(domSpecOf('RCTView', {}).classNames).toEqual([CLASS_NAMES.view]);
    expect(domSpecOf('RCTText', {}).classNames).toEqual([CLASS_NAMES.text]);
    expect(domSpecOf('RCTVirtualText', {}).classNames).toEqual([
      CLASS_NAMES.text,
    ]);
    expect(domSpecOf('RCTImageView', {}).classNames).toEqual([
      CLASS_NAMES.image,
    ]);
    expect(domSpecOf('RCTSinglelineTextInputView', {}).classNames).toEqual([
      CLASS_NAMES.input,
    ]);
  });

  it('treats a view name it does not know as a view', () => {
    expect(domSpecOf('SomeNativeThing', {}).classNames).toEqual([
      CLASS_NAMES.view,
    ]);
  });

  it('splits one bag into inline css and attributes', () => {
    const spec = domSpecOf('RCTView', {
      width: 10,
      testID: 'box',
      accessibilityLabel: 'Box',
    });

    expect(spec.css).toEqual({ width: '10px' });
    expect(spec.attributes).toEqual({
      'data-testid': 'box',
      'aria-label': 'Box',
    });
  });

  describe('text props', () => {
    it('applies the line limit and selection rules to a text', () => {
      const spec = domSpecOf('RCTText', {
        numberOfLines: 1,
        selectable: false,
      });

      expect(spec.css).toMatchObject({
        'white-space': 'nowrap',
        'user-select': 'none',
      });
    });

    it('ignores them on a nested text, which is inline in its parent', () => {
      expect(domSpecOf('RCTVirtualText', { numberOfLines: 1 }).css).toEqual({});
    });

    it('lets a style key beat the rule it overlaps', () => {
      const spec = domSpecOf('RCTText', {
        selectable: false,
        userSelect: 'all',
      });

      expect(spec.css['user-select']).toBe('all');
    });

    it('does not report them as props nobody wrote', () => {
      const skipped: string[] = [];
      domSpecOf(
        'RCTText',
        { numberOfLines: 2, ellipsizeMode: 'tail', selectable: true },
        key => skipped.push(key),
      );

      expect(skipped).toEqual([]);
    });
  });

  describe('pointerEvents', () => {
    it('writes a class per mode, the sheet holds the rules', () => {
      expect(
        domSpecOf('RCTView', { pointerEvents: 'none' }).classNames,
      ).toEqual([CLASS_NAMES.view, CLASS_NAMES.pointerNone]);
      expect(
        domSpecOf('RCTView', { pointerEvents: 'box-none' }).classNames,
      ).toEqual([CLASS_NAMES.view, CLASS_NAMES.pointerBoxNone]);
      expect(
        domSpecOf('RCTView', { pointerEvents: 'box-only' }).classNames,
      ).toEqual([CLASS_NAMES.view, CLASS_NAMES.pointerBoxOnly]);
    });

    it('writes nothing for auto, which is what an element does anyway', () => {
      expect(
        domSpecOf('RCTView', { pointerEvents: 'auto' }).classNames,
      ).toEqual([CLASS_NAMES.view]);
    });

    it('is not reported as a prop nobody wrote', () => {
      const skipped: string[] = [];
      domSpecOf('RCTView', { pointerEvents: 'none' }, key => skipped.push(key));

      expect(skipped).toEqual([]);
    });
  });
});
