// Turns a lightningcss `@media` query list into the tuple tree the runtime evaluates
// A feature RN cannot answer is unknown, and unknown reads as false once the whole query is known

import type {
  ContainerCondition,
  ContainerRule,
  Location2,
  MediaCondition,
  MediaFeatureComparison,
  MediaFeatureValue,
  MediaQuery,
  MediaRule,
  QueryFeatureFor_ContainerSizeFeatureId,
  QueryFeatureFor_MediaFeatureId,
  Resolution,
} from 'lightningcss';
import { mediaLengthPx } from './media-length.ts';

const MEDIA_NUMERIC = [
  'width',
  'height',
  'resolution',
  'aspect-ratio',
] as const;
const CONTAINER_NUMERIC = ['width', 'height', 'aspect-ratio'] as const;
const KEYWORD_FEATURES = [
  'orientation',
  'prefers-color-scheme',
  'prefers-reduced-motion',
  'prefers-contrast',
  'prefers-reduced-transparency',
  'platform',
  'dir',
] as const;
const CONTAINER_KEYWORDS = ['orientation'] as const;
// Written on its own these are false at `no-preference`, and the other keyword features are true
const OFF_KEYWORD_NAMES = [
  'prefers-reduced-motion',
  'prefers-contrast',
  'prefers-reduced-transparency',
] as const satisfies readonly (typeof KEYWORD_FEATURES)[number][];
const OFF_KEYWORD_FEATURES: ReadonlySet<string> = new Set(OFF_KEYWORD_NAMES);
const NO_PREFERENCE = 'no-preference';
const SCREEN_TYPES = ['all', 'screen'] as const;

type INumericFeature =
  (typeof MEDIA_NUMERIC)[number] | (typeof CONTAINER_NUMERIC)[number];
type IKeywordFeature = (typeof KEYWORD_FEATURES)[number];
type IScreenType = (typeof SCREEN_TYPES)[number];
type IMediaComparison = '=' | '>' | '>=' | '<' | '<=';
type IConditionalRule = 'media' | 'container';

export type IMediaCondition =
  | readonly ['&' | '|', readonly IMediaCondition[]]
  | readonly ['!', IMediaCondition]
  | readonly [IMediaComparison, INumericFeature, number]
  | readonly [IMediaComparison, IKeywordFeature, string]
  /** A size query against the nearest container, named or not */
  | readonly ['@', string | null, IMediaCondition];

export type IMediaContext = {
  /** Pixels per `rem` and `em`, the root font size */
  readonly remToPx: number;
  /** Told what could not be answered, so the author gets one warning per cause */
  readonly onUnsupported: (what: string, atRule: IConditionalRule) => void;
};

// What one at-rule can ask: `@container` has no `resolution` and no theme or platform features
type IQueryContext = IMediaContext & {
  readonly atRule: IConditionalRule;
  readonly numeric: readonly INumericFeature[];
  readonly keyword: readonly IKeywordFeature[];
};

// `inline-size` and `block-size` follow the writing mode, which RN fixes to horizontal
const CONTAINER_ALIASES: Readonly<Record<string, string>> = {
  'inline-size': 'width',
  'block-size': 'height',
};

const IDENT = 'ident';
const LENGTH = 'length';
const DPI_PER_DPPX = 96;
const CM_PER_INCH = 2.54;

const COMPARISONS: Readonly<Record<MediaFeatureComparison, IMediaComparison>> =
  {
    equal: '=',
    'greater-than': '>',
    'greater-than-equal': '>=',
    'less-than': '<',
    'less-than-equal': '<=',
  };

// `400px <= width` reads as `width >= 400px`: the operand sits on the left, so the operator flips
const FLIPPED: Readonly<Record<IMediaComparison, IMediaComparison>> = {
  '=': '=',
  '>': '<',
  '>=': '<=',
  '<': '>',
  '<=': '>=',
};

const ALWAYS: IMediaCondition = ['&', []];

function isScreenType(type: string): type is IScreenType {
  return SCREEN_TYPES.some(screen => screen === type);
}

function dotsPerPixel(resolution: Resolution): number {
  switch (resolution.type) {
    case 'dpi':
      return resolution.value / DPI_PER_DPPX;
    case 'dpcm':
      return (resolution.value * CM_PER_INCH) / DPI_PER_DPPX;
    default:
      return resolution.value;
  }
}

// Kept apart so `scalarOf` stays one branch per value type
// Infinity does not survive the JSON the conditions ship as, so the largest number stands in
function quotientOf([top, bottom]: readonly [number, number]):
  number | undefined {
  if (top < 0 || bottom < 0) return undefined;
  if (bottom === 0) return top === 0 ? 0 : Number.MAX_VALUE;
  return top / bottom;
}

// Other units (`cm`, `pt`, `vw`) are not read: a media query almost never spells one
function scalarOf(
  value: MediaFeatureValue,
  context: IMediaContext,
): number | string | undefined {
  switch (value.type) {
    case IDENT:
      return String(value.value);
    case 'resolution': {
      const dots = dotsPerPixel(value.value);
      return dots < 0 ? undefined : dots;
    }
    case 'ratio':
      return quotientOf(value.value);
    case LENGTH:
      return mediaLengthPx(value.value, context.remToPx);
    default:
      return undefined;
  }
}

function comparison(
  operator: IMediaComparison,
  name: string,
  value: MediaFeatureValue,
  context: IQueryContext,
): IMediaCondition | undefined {
  // A bare number is a ratio of one over the other, and only `aspect-ratio` reads one
  const scalar =
    value.type === 'number' && name === 'aspect-ratio'
      ? value.value
      : scalarOf(value, context);
  const numeric = context.numeric.find(feature => feature === name);
  const keyword = context.keyword.find(feature => feature === name);
  if (typeof scalar === 'number' && numeric !== undefined)
    return [operator, numeric, scalar];
  if (typeof scalar === 'string' && keyword !== undefined)
    return [operator, keyword, scalar];
  context.onUnsupported(
    `${context.atRule} feature \`${name}\``,
    context.atRule,
  );
  return undefined;
}

// A feature on its own is true unless its value is zero or its "off" keyword
function booleanFeature(
  name: string,
  context: IQueryContext,
): IMediaCondition | undefined {
  const numeric = context.numeric.find(feature => feature === name);
  if (numeric !== undefined) return ['>', numeric, 0];
  const keyword = context.keyword.find(feature => feature === name);
  if (keyword === undefined) {
    context.onUnsupported(
      `${context.atRule} feature \`${name}\``,
      context.atRule,
    );
    return undefined;
  }
  return OFF_KEYWORD_FEATURES.has(keyword)
    ? ['!', ['=', keyword, NO_PREFERENCE]]
    : ALWAYS;
}

function featureToCondition(
  feature:
    QueryFeatureFor_MediaFeatureId | QueryFeatureFor_ContainerSizeFeatureId,
  context: IQueryContext,
): IMediaCondition | undefined {
  const written = String(feature.name);
  const name =
    context.atRule === 'container'
      ? (CONTAINER_ALIASES[written] ?? written)
      : written;
  switch (feature.type) {
    case 'boolean':
      return booleanFeature(name, context);
    case 'plain':
      return comparison('=', name, feature.value, context);
    case 'range':
      return comparison(
        COMPARISONS[feature.operator],
        name,
        feature.value,
        context,
      );
    case 'interval': {
      const start = comparison(
        FLIPPED[COMPARISONS[feature.startOperator]],
        name,
        feature.start,
        context,
      );
      const end = comparison(
        COMPARISONS[feature.endOperator],
        name,
        feature.end,
        context,
      );
      return start === undefined || end === undefined
        ? undefined
        : ['&', [start, end]];
    }
    default:
      context.onUnsupported(
        `${context.atRule} feature \`${name}\``,
        context.atRule,
      );
      return undefined;
  }
}

function conditionToTuple(
  condition: MediaCondition | ContainerCondition,
  context: IQueryContext,
): IMediaCondition | undefined {
  switch (condition.type) {
    case 'feature':
      return featureToCondition(condition.value, context);
    case 'not': {
      const inner = conditionToTuple(condition.value, context);
      return inner === undefined ? undefined : ['!', inner];
    }
    case 'operation': {
      const parts = condition.conditions.map(part =>
        conditionToTuple(part, context),
      );
      const known = parts.flatMap(part => (part === undefined ? [] : [part]));
      if (known.length < parts.length) return undefined;
      return [condition.operator === 'or' ? '|' : '&', known];
    }
    default:
      context.onUnsupported(
        `a ${context.atRule} condition it could not read`,
        context.atRule,
      );
      return undefined;
  }
}

function queryToCondition(
  query: MediaQuery,
  context: IQueryContext,
): IMediaCondition | undefined {
  if (!isScreenType(query.mediaType)) {
    context.onUnsupported(`media type \`${query.mediaType}\``, 'media');
    return undefined;
  }
  const condition =
    query.condition == null
      ? ALWAYS
      : conditionToTuple(query.condition, context);
  if (condition === undefined) return undefined;
  return query.qualifier === 'not' ? ['!', condition] : condition;
}

/** `undefined` means no query in the list can ever be true here, so the rule is dropped */
export function mediaListToCondition(
  queries: readonly MediaQuery[],
  context: IMediaContext,
): IMediaCondition | undefined {
  const query: IQueryContext = {
    ...context,
    atRule: 'media',
    numeric: MEDIA_NUMERIC,
    keyword: KEYWORD_FEATURES,
  };
  const parts = queries.map(part => queryToCondition(part, query));
  const known = parts.flatMap(part => (part === undefined ? [] : [part]));
  if (known.length === 0 || known.length < parts.length) return undefined;
  return known.length === 1 ? known[0] : ['|', known];
}

// A container without a condition is a syntax error on the web, so there is nothing to answer
function containerToCondition(
  rule: ContainerRule,
  context: IMediaContext,
): IMediaCondition | undefined {
  if (rule.condition == null) return undefined;
  const inner = conditionToTuple(rule.condition, {
    ...context,
    atRule: 'container',
    numeric: CONTAINER_NUMERIC,
    keyword: CONTAINER_KEYWORDS,
  });
  return inner === undefined ? undefined : ['@', rule.name ?? null, inner];
}

export type IMediaTracker = {
  /** Visitor for `@media`: `[]` drops it with what it wraps, `undefined` lets the walk go on */
  readonly onMedia: (rule: { value: MediaRule }) => [] | undefined;
  /** The same for `@container` */
  readonly onContainer: (rule: { value: ContainerRule }) => [] | undefined;
  /** Condition id of a style rule at `loc`, `undefined` outside any `@media` */
  readonly idAt: (loc: Location2) => number | undefined;
  /** The deduplicated table the ids index, read after the walk */
  readonly conditions: () => readonly IMediaCondition[];
};

// The visitor names no enclosing rule, so each `@media` marks the rules it wraps by position
export function createMediaTracker(context: IMediaContext): IMediaTracker {
  const table: IMediaCondition[] = [];
  const idByCondition = new Map<string, number>();
  const enclosing = new Map<string, IMediaCondition>();
  const keyOf = (loc: Location2) =>
    `${loc.source_index}:${loc.line}:${loc.column}`;

  const idOf = (condition: IMediaCondition): number => {
    const key = JSON.stringify(condition);
    const known = idByCondition.get(key);
    if (known !== undefined) return known;
    table.push(condition);
    idByCondition.set(key, table.length - 1);
    return table.length - 1;
  };

  const enclose = (
    rule: MediaRule | ContainerRule,
    own: IMediaCondition | undefined,
  ): [] | undefined => {
    if (own === undefined) return [];
    const outer = enclosing.get(keyOf(rule.loc));
    const combined: IMediaCondition =
      outer === undefined ? own : ['&', [outer, own]];
    for (const child of rule.rules) {
      if ('value' in child && child.value != null && 'loc' in child.value) {
        enclosing.set(keyOf(child.value.loc), combined);
      }
    }
    return undefined;
  };

  const onMedia = ({ value: rule }: { value: MediaRule }) =>
    enclose(rule, mediaListToCondition(rule.query.mediaQueries, context));

  const onContainer = ({ value: rule }: { value: ContainerRule }) =>
    enclose(rule, containerToCondition(rule, context));

  const idAt = (loc: Location2): number | undefined => {
    const condition = enclosing.get(keyOf(loc));
    return condition === undefined ? undefined : idOf(condition);
  };

  return { onMedia, onContainer, idAt, conditions: () => table };
}
