// Reads the selectors lightningcss reports and says what each one actually is
// Tokens stay as authored with the combinator of every gap beside them

// The caller passes `nonStandard: { deepSelectorCombinator: true }` or `>>>` fails at parse time

import { createBuilder } from './selector-builder.ts';
import { consumeSelector } from './selector-components.ts';
import type {
  IDroppedSelector,
  ISelectorMatch,
  ISelectorResult,
} from './selector-types.ts';

export type {
  IDroppedSelector,
  ISelectorCombinator,
  ISelectorMatch,
  ISelectorResult,
} from './selector-types.ts';

// Why the rule can never fire on a device, per reason: what an author can do instead
const DROP_EXPLANATION: Record<IDroppedSelector['reason'], string> = {
  root: 'a `:root` rule paints nothing, it exists to declare custom properties, which are collected by their own pass',
  'pseudo-class': 'React Native has no such pseudo-class state',
  'pseudo-element': 'React Native has no pseudo-elements',
  attribute: 'React Native has no attribute selectors',
  element: 'React Native has no element/tag selectors',
  id: 'React Native has no id selectors',
  universal: 'React Native has no universal selector',
  unsupported: 'this selector shape has no React Native equivalent',
};

function warnDropped(problem: IDroppedSelector, filename: string): void {
  console.warn(
    `[@symbiote-native/css-parser] ${filename}: dropped a rule on \`${problem.detail}\` — ${DROP_EXPLANATION[problem.reason]}, so it can never match in React Native.`,
  );
}

// Each comma-separated selector is judged on its own, so one list can yield a match and a drop
export function selectorsToMatches(
  selectors: unknown,
  filename: string,
): ISelectorResult {
  if (!Array.isArray(selectors)) return { matches: [], dropped: [] };

  const matches: ISelectorMatch[] = [];
  const dropped: IDroppedSelector[] = [];
  for (const selector of selectors) {
    if (!Array.isArray(selector) || selector.length === 0) continue;

    const builder = createBuilder();
    consumeSelector(builder, selector);
    // Nothing to register and nothing said why, so say so rather than emit a match with no tokens
    if (builder.drop === null && builder.tokens.length === 0) {
      builder.drop = { reason: 'unsupported', detail: 'no class selector' };
    }

    const problem = builder.drop;
    if (problem !== null) {
      dropped.push(problem);
      // `root` stays silent here, the caller speaks only if the block would have painted
      if (problem.reason !== 'root') warnDropped(problem, filename);
      continue;
    }

    matches.push({
      tokens: builder.tokens,
      combinators: builder.combinators,
      specificity: builder.specificity,
      ...(builder.state === null ? {} : { state: builder.state }),
    });
  }

  return { matches, dropped };
}
