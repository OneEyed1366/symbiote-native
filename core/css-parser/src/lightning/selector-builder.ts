import {
  COMBINATOR,
  type IDroppedSelector,
  type ISelectorCombinator,
} from './selector-types.ts';

export type IBuilder = {
  readonly tokens: string[];
  readonly combinators: ISelectorCombinator[];
  readonly specificity: [number, number, number];
  /** The combinator that will separate the next token from the one already collected */
  pending: ISelectorCombinator;
  /** First problem found: the whole selector drops on it, but the walk keeps counting */
  drop: IDroppedSelector | null;
};

export function createBuilder(): IBuilder {
  return {
    tokens: [],
    combinators: [],
    specificity: [0, 0, 0],
    pending: COMBINATOR.none,
    drop: null,
  };
}

export function pushToken(builder: IBuilder, name: string): void {
  if (builder.tokens.length > 0) builder.combinators.push(builder.pending);
  builder.tokens.push(name);
  builder.pending = COMBINATOR.none;
}

// A descendant never downgrades a pending explicit combinator: `::v-deep` arrives between two
// synthetic descendants, and a `:global()` stream pads `>` with spaces
export function setCombinator(
  builder: IBuilder,
  next: ISelectorCombinator,
): void {
  if (next === COMBINATOR.descendant && builder.pending !== COMBINATOR.none) {
    return;
  }
  builder.pending = next;
}

export function drop(
  builder: IBuilder,
  reason: IDroppedSelector['reason'],
  detail: string,
): void {
  builder.drop ??= { reason, detail };
}

// Whether a `deep` gap already sits in the selector or is about to
export function isDeepPath(builder: IBuilder): boolean {
  return (
    builder.combinators.includes(COMBINATOR.deep) ||
    builder.pending === COMBINATOR.deep
  );
}
