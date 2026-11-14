// The label of a Button is styled by the button it sits in, as RN's Button does and the C++ rule
// reproduces: a blue centered text, tinted by `color`, grey while the button is disabled

import { describe, expect, it } from 'vitest';
import { buttonLabelCss } from './button-rules';

describe('button label style', () => {
  it('is a centered 18px text in the system blue', () => {
    expect(buttonLabelCss({})).toEqual({
      'text-align': 'center',
      margin: '8px',
      color: '#007AFF',
      'font-size': '18px',
    });
  });

  it('takes the tint of the button', () => {
    expect(buttonLabelCss({ color: 'tomato' }).color).toBe('tomato');
  });

  it('ignores an empty tint', () => {
    expect(buttonLabelCss({ color: '' }).color).toBe('#007AFF');
  });

  it('turns grey while disabled, over any tint', () => {
    expect(buttonLabelCss({ color: 'tomato', isDisabled: true }).color).toBe(
      '#cdcdcd',
    );
  });

  it('keeps the blue for an explicitly enabled button', () => {
    expect(buttonLabelCss({ isDisabled: false }).color).toBe('#007AFF');
  });
});
