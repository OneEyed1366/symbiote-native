// `>>>`, `/deep/`, `::v-deep` and `::ng-deep` all read as `deep`
export const COMBINATOR = {
  none: 'none',
  descendant: 'descendant',
  child: 'child',
  nextSibling: 'next-sibling',
  laterSibling: 'later-sibling',
  deep: 'deep',
} as const;

export type ISelectorCombinator = (typeof COMBINATOR)[keyof typeof COMBINATOR];

export type ISelectorMatch = {
  /** Class names as authored, in source order, never camel-cased or collapsed */
  readonly tokens: readonly string[];
  /** CSS specificity (a,b,c) = (id, class/attr/pseudo-class, element/pseudo-element) */
  readonly specificity: readonly [number, number, number];
  /** The combinators between the tokens, one per gap (length is tokens.length - 1) */
  readonly combinators: readonly ISelectorCombinator[];
};

export type IDroppedSelector = {
  // `state-pseudo-class` is disabled on purpose, not impossible, so its warning differs
  readonly reason:
    | 'root'
    | 'pseudo-class'
    | 'pseudo-element'
    | 'attribute'
    | 'element'
    | 'id'
    | 'universal'
    | 'unsupported'
    | 'state-pseudo-class';
  /** e.g. 'hover', '[data-x]', 'div' */
  readonly detail: string;
};

export type ISelectorResult = {
  /** One per comma-separated selector that is usable */
  readonly matches: readonly ISelectorMatch[];
  /** The rest, with a reason */
  readonly dropped: readonly IDroppedSelector[];
};
