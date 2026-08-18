// Every case runs the REAL lightningcss AST, not a hand-written fixture: the whole point of this
// module is that it reads what lightningcss reports, so a fixture that drifts from the parser
// would make the suite green about the wrong shape.

import { transform } from 'lightningcss';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  selectorsToMatches,
  type IDroppedSelector,
  type ISelectorCombinator,
} from './selectors.ts';

const FILENAME = 'Card.css';

// `deepSelectorCombinator` is what turns `>>>` / `/deep/` from a parse error into a combinator
// value — see the module header. `cssModules` is a real fork in the AST, not a formality: it is
// what decides whether `:global()` arrives parsed or as a raw token stream, so every `:global()`
// case runs through BOTH.
function selectorsFor(selectorText: string, cssModules: boolean): unknown {
  const collected: unknown[] = [];

  transform({
    filename: FILENAME,
    code: Buffer.from(`${selectorText} { color: red }`),
    errorRecovery: true,
    nonStandard: { deepSelectorCombinator: true },
    cssModules: cssModules ? { pattern: '[local]__mod__[hash]' } : false,
    visitor: {
      Rule(rule) {
        if (rule.type === 'style') collected.push(rule.value.selectors);
      },
    },
  });

  return collected[0];
}

function matchesFor(selectorText: string, cssModules = false) {
  return selectorsToMatches(selectorsFor(selectorText, cssModules), FILENAME);
}

const MODES = [
  { mode: 'cssModules OFF', cssModules: false },
  { mode: 'cssModules ON', cssModules: true },
];

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

interface IKeptCase {
  readonly selector: string;
  readonly tokens: readonly string[];
  readonly combinators: readonly ISelectorCombinator[];
}

const KEPT: readonly IKeptCase[] = [
  { selector: '.card', tokens: ['card'], combinators: [] },
  {
    selector: '.btn.primary',
    tokens: ['btn', 'primary'],
    combinators: ['none'],
  },
  {
    selector: '.card .title',
    tokens: ['card', 'title'],
    combinators: ['descendant'],
  },
  {
    selector: '.card > .title',
    tokens: ['card', 'title'],
    combinators: ['child'],
  },
  {
    selector: '.card + .title',
    tokens: ['card', 'title'],
    combinators: ['next-sibling'],
  },
  {
    selector: '.card ~ .title',
    tokens: ['card', 'title'],
    combinators: ['later-sibling'],
  },
  // The whole reason this module exists: the authored spelling survives untouched.
  { selector: '.card-title', tokens: ['card-title'], combinators: [] },
  {
    selector: '.card-title .inner-label',
    tokens: ['card-title', 'inner-label'],
    combinators: ['descendant'],
  },
  { selector: '.a_b', tokens: ['a_b'], combinators: [] },
  {
    selector: '.a.b .c.d',
    tokens: ['a', 'b', 'c', 'd'],
    combinators: ['none', 'descendant', 'none'],
  },
  { selector: '.a >>> .b', tokens: ['a', 'b'], combinators: ['deep'] },
  { selector: '.a /deep/ .b', tokens: ['a', 'b'], combinators: ['deep'] },
  { selector: '.a ::v-deep .b', tokens: ['a', 'b'], combinators: ['deep'] },
  { selector: '.a ::ng-deep .b', tokens: ['a', 'b'], combinators: ['deep'] },
  // Vue's `:deep()` is a custom-function pseudo-class, not a combinator value — lightningcss
  // implements no `:deep()` at all — but it expresses the same reach-through relation.
  { selector: '.a :deep(.b)', tokens: ['a', 'b'], combinators: ['deep'] },
  {
    selector: '.a :deep(.b .c)',
    tokens: ['a', 'b', 'c'],
    combinators: ['deep', 'descendant'],
  },
  {
    selector: '.a :deep(.b > .c)',
    tokens: ['a', 'b', 'c'],
    combinators: ['deep', 'child'],
  },
  { selector: ':deep(.b)', tokens: ['b'], combinators: [] },
];

const GLOBAL_KEPT: readonly IKeptCase[] = [
  { selector: ':global(.reset)', tokens: ['reset'], combinators: [] },
  {
    selector: ':global(.legacy-reset)',
    tokens: ['legacy-reset'],
    combinators: [],
  },
  {
    selector: '.card :global(.reset)',
    tokens: ['card', 'reset'],
    combinators: ['descendant'],
  },
  { selector: ':global(.a.b)', tokens: ['a', 'b'], combinators: ['none'] },
  {
    selector: ':global(.a .b)',
    tokens: ['a', 'b'],
    combinators: ['descendant'],
  },
  { selector: ':global(.a > .b)', tokens: ['a', 'b'], combinators: ['child'] },
  {
    selector: ':global(.a + .b)',
    tokens: ['a', 'b'],
    combinators: ['next-sibling'],
  },
  {
    selector: ':global(.a ~ .b)',
    tokens: ['a', 'b'],
    combinators: ['later-sibling'],
  },
  {
    selector: ':global(.a) :global(.b)',
    tokens: ['a', 'b'],
    combinators: ['descendant'],
  },
  {
    selector: '.a :global(.b) .c',
    tokens: ['a', 'b', 'c'],
    combinators: ['descendant', 'descendant'],
  },
];

const DROPPED: readonly (IDroppedSelector & { readonly selector: string })[] = [
  { selector: '.card:hover', reason: 'pseudo-class', detail: 'hover' },
  { selector: '.card:focus', reason: 'pseudo-class', detail: 'focus' },
  {
    selector: '.card:nth-child(2)',
    reason: 'pseudo-class',
    detail: 'nth-child',
  },
  { selector: '.card:not(.big)', reason: 'pseudo-class', detail: 'not' },
  { selector: '.card::before', reason: 'pseudo-element', detail: 'before' },
  {
    selector: '.card::placeholder',
    reason: 'pseudo-element',
    detail: 'placeholder',
  },
  { selector: '.card[data-x]', reason: 'attribute', detail: '[data-x]' },
  {
    selector: '.card[data-x="y"]',
    reason: 'attribute',
    detail: '[data-x]',
  },
  { selector: 'div', reason: 'element', detail: 'div' },
  { selector: 'div.card', reason: 'element', detail: 'div' },
  { selector: '#header', reason: 'id', detail: '#header' },
  { selector: '.card #header', reason: 'id', detail: '#header' },
  { selector: '*', reason: 'universal', detail: '*' },
  { selector: '.card *', reason: 'universal', detail: '*' },
  // `ns|div` opens on a `namespace` component this compiler has no context for.
  { selector: 'ns|div', reason: 'unsupported', detail: 'namespace' },
  // The non-functional CSS-Modules `:global` form carries no payload to unwrap.
  { selector: ':global .a', reason: 'pseudo-class', detail: 'global' },
  // Under cssModules the whole rule is rejected before this walk, so this row is OFF-only.
  { selector: ':global(.)', reason: 'unsupported', detail: ':global()' },
  // A `:deep()` payload drops with the payload's OWN reason, exactly like `:global()`.
  { selector: '.a :deep(#x)', reason: 'id', detail: '#x' },
  { selector: '.a :deep(div)', reason: 'element', detail: 'div' },
  { selector: '.a :deep(.b:hover)', reason: 'pseudo-class', detail: 'hover' },
  { selector: '.a :deep(*)', reason: 'universal', detail: '*' },
  { selector: '.a :deep(.)', reason: 'unsupported', detail: ':deep()' },
];

describe('selectorsToMatches — kept selectors', () => {
  it.each(KEPT)(
    '$selector -> $tokens / $combinators',
    ({ selector, tokens, combinators }) => {
      const result = matchesFor(selector);

      expect(result.dropped).toEqual([]);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.tokens).toEqual(tokens);
      expect(result.matches[0]?.combinators).toEqual(combinators);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('emits exactly one combinator per gap', () => {
    for (const { selector } of [...KEPT, ...GLOBAL_KEPT]) {
      const match = matchesFor(selector).matches[0];
      expect(match?.combinators).toHaveLength((match?.tokens.length ?? 0) - 1);
    }
  });
});

// Payloads that are not a plain class chain. Both AST shapes must report the payload's OWN reason
// and the same detail — a warning that changed wording with the cssModules flag would be a bug.
const GLOBAL_DROPPED: readonly (IDroppedSelector & {
  readonly selector: string;
})[] = [
  { selector: ':global(div)', reason: 'element', detail: 'div' },
  { selector: ':global(#x)', reason: 'id', detail: '#x' },
  { selector: ':global(*)', reason: 'universal', detail: '*' },
  { selector: ':global(.a:hover)', reason: 'pseudo-class', detail: 'hover' },
  {
    selector: ':global(.a::before)',
    reason: 'pseudo-element',
    detail: 'before',
  },
  { selector: ':global(.a[data-x])', reason: 'attribute', detail: '[data-x]' },
];

describe.each(MODES)(
  'selectorsToMatches — :global() under $mode',
  ({ cssModules }) => {
    it.each(GLOBAL_KEPT)(
      '$selector -> $tokens / $combinators',
      ({ selector, tokens, combinators }) => {
        const result = matchesFor(selector, cssModules);

        expect(result.dropped).toEqual([]);
        expect(result.matches[0]?.tokens).toEqual(tokens);
        expect(result.matches[0]?.combinators).toEqual(combinators);
      },
    );

    it.each(GLOBAL_DROPPED)(
      '$selector -> $reason ($detail)',
      ({ selector, reason, detail }) => {
        const result = matchesFor(selector, cssModules);

        expect(result.matches).toEqual([]);
        expect(result.dropped).toEqual([{ reason, detail }]);
      },
    );

    it('does not add specificity of its own', () => {
      expect(
        matchesFor(':global(.a.b)', cssModules).matches[0]?.specificity,
      ).toEqual([0, 2, 0]);
    });
  },
);

// The regression this pair pins: cssModules ON reports `{kind:'global', selector:[…]}` while OFF
// reports `{kind:'custom-function', name:'global', arguments:[…]}`. Handling only the second made
// a `.module.css` drop the rule whole — no style registered, no export emitted.
describe('selectorsToMatches — the two :global() AST shapes agree', () => {
  it.each([':global(.reset)', '.card :global(.inner)', ':global(.a > .b)'])(
    '%s is the same match parsed or tokenized',
    selector => {
      expect(matchesFor(selector, true).matches).toEqual(
        matchesFor(selector, false).matches,
      );
      expect(matchesFor(selector, true).matches).toHaveLength(1);
    },
  );

  it('the parsed shape is what the token stream promises', () => {
    expect(matchesFor(':global(.reset)', true).matches).toEqual([
      { tokens: ['reset'], combinators: [], specificity: [0, 1, 0] },
    ]);
    expect(matchesFor('.card :global(.inner)', true).matches).toEqual([
      {
        tokens: ['card', 'inner'],
        combinators: ['descendant'],
        specificity: [0, 2, 0],
      },
    ]);
  });
});

// `:deep()` has NO parsed form — lightningcss implements no `:deep()`, so cssModules leaves it as
// the raw custom-function in both modes. Pinned so a future lightningcss that DOES parse it fails
// here rather than silently in a scoped stylesheet.
describe('selectorsToMatches — :deep() is mode-independent', () => {
  it.each(['.a :deep(.b)', '.a :deep(.b .c)', '.a :deep(#x)', '.a :deep(div)'])(
    '%s is identical with and without cssModules',
    selector => {
      expect(matchesFor(selector, true)).toEqual(matchesFor(selector, false));
    },
  );
});

describe('selectorsToMatches — the five deep spellings agree', () => {
  it('produces one identical match for every form', () => {
    const forms = [
      '.a >>> .b',
      '.a /deep/ .b',
      '.a ::v-deep .b',
      '.a ::ng-deep .b',
      '.a :deep(.b)',
    ];
    const expected = {
      tokens: ['a', 'b'],
      combinators: ['deep'],
      specificity: [0, 2, 0],
    };

    for (const form of forms)
      expect(matchesFor(form).matches).toEqual([expected]);
  });

  it(':deep() adds no specificity of its own', () => {
    expect(matchesFor('.a :deep(.b.c)').matches[0]?.specificity).toEqual([
      0, 3, 0,
    ]);
  });
});

describe('selectorsToMatches — dropped selectors', () => {
  it.each(DROPPED)(
    '$selector -> $reason ($detail)',
    ({ selector, reason, detail }) => {
      const result = matchesFor(selector);

      expect(result.matches).toEqual([]);
      expect(result.dropped).toEqual([{ reason, detail }]);
    },
  );

  it('warns once per dropped selector, naming the file', () => {
    matchesFor('.card:hover');

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain(`[symbiote-css] ${FILENAME}:`);
    expect(message).toContain('hover');
    expect(message).toContain('never match');
  });

  it('reports the FIRST problem when a selector has several', () => {
    expect(matchesFor('div.card:hover').dropped).toEqual([
      { reason: 'element', detail: 'div' },
    ]);
  });
});

describe('selectorsToMatches — comma-separated lists', () => {
  it('keeps the usable parts and drops the rest', () => {
    const result = matchesFor('.a, .b .c, div, .card:hover, :global(.reset)');

    expect(result.matches).toEqual([
      { tokens: ['a'], combinators: [], specificity: [0, 1, 0] },
      {
        tokens: ['b', 'c'],
        combinators: ['descendant'],
        specificity: [0, 2, 0],
      },
      { tokens: ['reset'], combinators: [], specificity: [0, 1, 0] },
    ]);
    expect(result.dropped).toEqual([
      { reason: 'element', detail: 'div' },
      { reason: 'pseudo-class', detail: 'hover' },
    ]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('drops every part when none is usable', () => {
    const result = matchesFor('div, #x, *');

    expect(result.matches).toEqual([]);
    expect(result.dropped.map(entry => entry.reason)).toEqual([
      'element',
      'id',
      'universal',
    ]);
  });
});

describe('selectorsToMatches — specificity', () => {
  it.each([
    { selector: '.a', specificity: [0, 1, 0] },
    { selector: '.a.b', specificity: [0, 2, 0] },
    { selector: '.a.b.c', specificity: [0, 3, 0] },
    { selector: '.a .b > .c', specificity: [0, 3, 0] },
    { selector: '.a :global(.b)', specificity: [0, 2, 0] },
    { selector: '.a ::v-deep .b', specificity: [0, 2, 0] },
  ])('$selector -> $specificity', ({ selector, specificity }) => {
    expect(matchesFor(selector).matches[0]?.specificity).toEqual(specificity);
  });
});

describe('selectorsToMatches — malformed input', () => {
  it.each([undefined, null, 'not-a-list', 42, {}])(
    'returns an empty result for %s',
    value => {
      expect(selectorsToMatches(value, FILENAME)).toEqual({
        matches: [],
        dropped: [],
      });
    },
  );

  it('drops a component shape lightningcss never produces', () => {
    const result = selectorsToMatches([[{ type: 'made-up' }]], FILENAME);

    expect(result.matches).toEqual([]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]?.reason).toBe('unsupported');
  });

  it('skips an empty selector rather than emitting a token-less match', () => {
    expect(selectorsToMatches([[]], FILENAME)).toEqual({
      matches: [],
      dropped: [],
    });
  });
});
