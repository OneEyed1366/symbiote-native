// Reads selectors off the lightningcss AST and refuses to guess: tokens stay as authored and
// every gap keeps its combinator, so `.a .b` and `.a.b` never collapse into one key

// A `deep` combinator appears only when `transform` gets
// `nonStandard: { deepSelectorCombinator: true }`, else `>>>` and `/deep/` fail to parse

import { createBuilder, drop, type IBuilder } from './selector-builder.ts';
import { consumeSelector } from './selector-components.ts';
import type {
  IDroppedSelector,
  ISelectorMatch,
  ISelectorResult,
} from './selector-types.ts';
import { warnDropped } from './selector-warnings.ts';

export { IS_STATE_TOKEN_ENABLED } from './state-token.ts';
export type {
  IDroppedSelector,
  ISelectorCombinator,
  ISelectorMatch,
  ISelectorResult,
} from './selector-types.ts';

// No class survived and nothing said why (a lone `::v-deep`): report it, never an empty match
function problemOf(builder: IBuilder): IDroppedSelector | null {
  if (builder.drop === null && builder.tokens.length === 0) {
    drop(builder, 'unsupported', 'no class selector');
  }
  return builder.drop;
}

/**
 * `selectors` is `rule.value.selectors` of lightningcss: one component array per comma-separated
 * selector. Each is judged alone, so one list can yield both a match and a drop
 */
export function selectorsToMatches(
  selectors: unknown,
  filename: string,
): ISelectorResult {
  const matches: ISelectorMatch[] = [];
  const dropped: IDroppedSelector[] = [];
  if (!Array.isArray(selectors)) return { matches, dropped };

  for (const selector of selectors) {
    if (!Array.isArray(selector) || selector.length === 0) continue;

    const builder = createBuilder();
    consumeSelector(builder, selector);

    const problem = problemOf(builder);
    if (problem === null) {
      matches.push({
        tokens: builder.tokens,
        combinators: builder.combinators,
        specificity: builder.specificity,
      });
      continue;
    }
    dropped.push(problem);
    warnDropped(problem, filename);
  }

  return { matches, dropped };
}
