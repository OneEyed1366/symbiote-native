import {
  COMBINATOR,
  type IDroppedSelector,
  type ISelectorCombinator,
} from './selector-types.ts';

export type IBuilder = {
  readonly tokens: string[];
  readonly combinators: ISelectorCombinator[];
  readonly specificity: [number, number, number];
  // The combinator that will separate the next token from the one already collected
  pending: ISelectorCombinator;
  // The state of the compound being read, `:hover` and the like
  state: string | null;
  // The first problem found: the selector is dropped on it, but the walk keeps counting
  drop: IDroppedSelector | null;
};

export function createBuilder(): IBuilder {
  return {
    tokens: [],
    combinators: [],
    specificity: [0, 0, 0],
    pending: COMBINATOR.none,
    state: null,
    drop: null,
  };
}

export function drop(
  builder: IBuilder,
  reason: IDroppedSelector['reason'],
  detail: string,
): void {
  builder.drop ??= { reason, detail };
}

export function pushToken(builder: IBuilder, name: string): void {
  if (builder.tokens.length > 0) builder.combinators.push(builder.pending);
  builder.tokens.push(name);
  builder.pending = COMBINATOR.none;
}

// A descendant never downgrades the combinator already pending, т.к. `::v-deep` and a `:global()`
// token stream bracket the real one with whitespace
// A state before a combinator means the state sits on an ancestor, which no node can be told about
export function setCombinator(
  builder: IBuilder,
  next: ISelectorCombinator,
): void {
  if (next === COMBINATOR.descendant && builder.pending !== COMBINATOR.none) {
    return;
  }
  if (builder.state !== null) {
    drop(builder, 'pseudo-class', `${builder.state.slice(1)} on an ancestor`);
  }
  builder.pending = next;
}

function isDeep(builder: IBuilder): boolean {
  return (
    builder.combinators.includes(COMBINATOR.deep) ||
    builder.pending === COMBINATOR.deep
  );
}

// A state is no token, it is the key the values of the rule are written under
export function takeState(builder: IBuilder, name: string, key: string): void {
  builder.specificity[1]++;
  if (isDeep(builder)) {
    drop(builder, 'pseudo-class', `${name} through a deep combinator`);
  } else if (builder.state === null) {
    builder.state = key;
  } else {
    drop(builder, 'pseudo-class', `${name} next to another state`);
  }
}
