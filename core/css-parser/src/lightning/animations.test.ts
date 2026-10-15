// `@keyframes`, `animation` and `transition` compile to Reanimated's CSS style keys

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileCssToRules } from './rules.ts';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

function styleOf(css: string) {
  const { rules } = compileCssToRules(css, { filename: 'motion.css' });
  const [rule] = rules;
  if (rule === undefined) throw new Error('the css compiled to no rule');
  return rule.style;
}

const FADE = '@keyframes fade { from { opacity: 0 } to { opacity: 1 } }';

describe('@keyframes used by an animation', () => {
  it('is written into the rule as the animation name', () => {
    const style = styleOf(`${FADE} .box { animation-name: fade; }`);

    expect(style.animationName).toEqual({
      from: { opacity: 0 },
      to: { opacity: 1 },
    });
  });

  it('keeps a percentage offset as the CSS spells it', () => {
    const style = styleOf(
      '@keyframes pulse { 0% { opacity: 1 } 50% { opacity: 0.5 } 100% { opacity: 1 } }' +
        ' .box { animation-name: pulse; }',
    );

    expect(Object.keys(style.animationName as object)).toEqual([
      '0%',
      '50%',
      '100%',
    ]);
  });

  it('gives a transform as the text React Native reads', () => {
    const style = styleOf(
      '@keyframes spin { to { transform: rotate(360deg) } } .box { animation-name: spin; }',
    );

    expect(style.animationName).toEqual({
      to: { transform: 'rotate(360deg)' },
    });
  });

  it('stays the name when no rule of that name is in the file, for the runtime to find', () => {
    const style = styleOf('.box { animation: shared 1s linear; width: 10px; }');

    expect(style).toMatchObject({
      animationName: 'shared',
      animationDuration: '1s',
      width: 10,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('is carried by a rule of its own, with the name the runtime looks it up by', () => {
    const { rules } = compileCssToRules(`${FADE} .box { width: 10px; }`, {
      filename: 'motion.css',
    });

    const carrier = rules.find(rule => rule.tokens.length === 0);
    expect(carrier?.style).toEqual({
      '@keyframes fade': { from: { opacity: 0 }, to: { opacity: 1 } },
    });
  });

  it('is carried under the renamed name in a CSS module', () => {
    const { rules, exports } = compileCssToRules(
      `${FADE} .box { animation: fade 1s; }`,
      { filename: 'motion.module.css', pattern: '[local]__m' },
    );

    const carrier = rules.find(rule => rule.tokens.length === 0);
    expect(Object.keys(carrier?.style ?? {})).toEqual([
      `@keyframes ${exports.fade}`,
    ]);
  });

  it('is not carried when the file declares none', () => {
    const { rules } = compileCssToRules('.box { width: 10px; }', {
      filename: 'motion.css',
    });

    expect(rules.every(rule => rule.tokens.length > 0)).toBe(true);
  });

  it('is found however far from the rule using it it was declared', () => {
    const style = styleOf(`.box { animation-name: fade; } ${FADE}`);

    expect(style.animationName).toEqual({
      from: { opacity: 0 },
      to: { opacity: 1 },
    });
  });
});

describe('the animation shorthand', () => {
  it('sets every longhand, the ones left out at their CSS defaults', () => {
    const style = styleOf(
      `${FADE} .box { animation: fade 1s ease-in 200ms 3 alternate both; }`,
    );

    expect(style).toEqual({
      animationName: { from: { opacity: 0 }, to: { opacity: 1 } },
      animationDuration: '1s',
      animationTimingFunction: 'ease-in',
      animationDelay: '200ms',
      animationIterationCount: 3,
      animationDirection: 'alternate',
      animationFillMode: 'both',
      animationPlayState: 'running',
    });
  });

  it('reads infinite as the word', () => {
    const style = styleOf(`${FADE} .box { animation: fade 1s infinite; }`);

    expect(style.animationIterationCount).toBe('infinite');
  });

  it('lists the values of several animations in order', () => {
    const style = styleOf(
      `${FADE} @keyframes spin { to { transform: rotate(1turn) } } ` +
        '.box { animation: fade 1s, spin 2s; }',
    );

    expect(style.animationDuration).toEqual(['1s', '2s']);
    expect(style.animationName).toHaveLength(2);
  });

  it('turns an animation off with none', () => {
    const style = styleOf('.box { animation: none; }');

    expect(style.animationName).toBe('none');
  });
});

describe('the animation longhands', () => {
  it('give a timing function as the text Reanimated reads', () => {
    const style = styleOf(
      `${FADE} .box { animation-name: fade; animation-timing-function: cubic-bezier(0.25, 0.5, 0.75, 1); }`,
    );

    expect(style.animationTimingFunction).toBe(
      'cubic-bezier(0.25, 0.5, 0.75, 1)',
    );
  });

  // lightningcss reads `jump-end` as `end`, which is the same easing
  it('give steps with their count and position', () => {
    const style = styleOf(
      `${FADE} .box { animation-name: fade; animation-timing-function: steps(4, jump-end); }`,
    );

    expect(style.animationTimingFunction).toBe('steps(4, end)');
  });

  it('give the state words as they are', () => {
    const style = styleOf(
      `${FADE} .box { animation-name: fade; animation-play-state: paused; animation-fill-mode: forwards; animation-direction: reverse; }`,
    );

    expect(style).toMatchObject({
      animationPlayState: 'paused',
      animationFillMode: 'forwards',
      animationDirection: 'reverse',
    });
  });
});

describe('transitions', () => {
  it('come from the shorthand as one value per longhand', () => {
    const style = styleOf('.box { transition: opacity 300ms linear 50ms; }');

    expect(style).toEqual({
      transitionProperty: 'opacity',
      transitionDuration: '300ms',
      transitionTimingFunction: 'linear',
      transitionDelay: '50ms',
    });
  });

  it('list several properties in order, with the property in React Native spelling', () => {
    const style = styleOf(
      '.box { transition: background-color 1s, width 2s ease-out; }',
    );

    expect(style.transitionProperty).toEqual(['backgroundColor', 'width']);
    expect(style.transitionDuration).toEqual(['1s', '2s']);
    expect(style.transitionTimingFunction).toEqual(['ease', 'ease-out']);
  });

  it('come from the longhands one by one', () => {
    const style = styleOf(
      '.box { transition-property: opacity, width; transition-duration: 1s; transition-delay: 100ms; }',
    );

    expect(style).toEqual({
      transitionProperty: ['opacity', 'width'],
      transitionDuration: '1s',
      transitionDelay: '100ms',
    });
  });

  it('keep all as the word', () => {
    const style = styleOf('.box { transition: all 1s; }');

    expect(style.transitionProperty).toBe('all');
  });
});
