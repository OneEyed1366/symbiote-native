// `none` joins the tokens of one compound (`.a.b`)
// `deep` is `>>>`, `/deep/`, `::v-deep` and `::ng-deep`
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
  // Class names as authored, in source order
  readonly tokens: readonly string[];
  // Specificity (a,b,c): id, class / attribute / pseudo-class, element / pseudo-element
  readonly specificity: readonly [number, number, number];
  // The combinators between the tokens, one per gap
  readonly combinators: readonly ISelectorCombinator[];
  // The state of the last compound (`:hover`), under which the values of the rule are written
  readonly state?: string;
};

export type IDroppedSelector = {
  readonly reason:
    | 'root'
    | 'pseudo-class'
    | 'pseudo-element'
    | 'attribute'
    | 'element'
    | 'id'
    | 'universal'
    | 'unsupported';
  // What was dropped, like `nth-child`, `[data-x]` or `div`
  readonly detail: string;
};

export type ISelectorResult = {
  // One per comma-separated selector that is usable
  readonly matches: readonly ISelectorMatch[];
  // The rest, with a reason
  readonly dropped: readonly IDroppedSelector[];
};
