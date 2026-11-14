// Text props with no style key of their own. React Native resolves these in the native commit
// path, so the web host carries its own copy, asserted against the DOM

import type { ICssDeclarations } from './css-values';

export type ITextRuleProps = {
  numberOfLines?: unknown;
  ellipsizeMode?: unknown;
  selectable?: unknown;
};

const CLIP = 'clip';

function lineLimitOf(bag: ITextRuleProps): ICssDeclarations {
  const lines = bag.numberOfLines;
  if (typeof lines !== 'number' || !(lines > 0)) return {};
  if (lines === 1) {
    return {
      display: 'block',
      overflow: 'hidden',
      'text-overflow': bag.ellipsizeMode === CLIP ? CLIP : 'ellipsis',
      'white-space': 'nowrap',
    };
  }
  return {
    display: '-webkit-box',
    overflow: 'hidden',
    '-webkit-box-orient': 'vertical',
    '-webkit-line-clamp': String(lines),
    'line-clamp': String(lines),
  };
}

export function textDeclarations(bag: ITextRuleProps): ICssDeclarations {
  const out = lineLimitOf(bag);
  if (typeof bag.selectable === 'boolean') {
    out['user-select'] = bag.selectable ? 'text' : 'none';
  }
  return out;
}
