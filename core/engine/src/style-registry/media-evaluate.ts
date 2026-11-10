// Evaluates the `@media` tuple tree the css-parser emits against one snapshot of the environment
// The tree type mirrors the compiler's, since the engine does not depend on the parser

const NUMERIC_FEATURES = ['width', 'height', 'resolution'] as const;
const KEYWORD_FEATURES = [
  'orientation',
  'prefers-color-scheme',
  'prefers-reduced-motion',
  'prefers-contrast',
  'prefers-reduced-transparency',
  'platform',
  'dir',
] as const;

const COMPARISONS = ['=', '>', '>=', '<', '<='] as const;

export type INumericFeature = (typeof NUMERIC_FEATURES)[number];
export type IKeywordFeature = (typeof KEYWORD_FEATURES)[number];
export type IMediaComparison = (typeof COMPARISONS)[number];

export function isNumericFeature(name: string): name is INumericFeature {
  return NUMERIC_FEATURES.some(feature => feature === name);
}

export function isKeywordFeature(name: string): name is IKeywordFeature {
  return KEYWORD_FEATURES.some(feature => feature === name);
}

export function isMediaComparison(text: string): text is IMediaComparison {
  return COMPARISONS.some(comparison => comparison === text);
}

export type IMediaCondition =
  | readonly ['&' | '|', readonly IMediaCondition[]]
  | readonly ['!', IMediaCondition]
  | readonly [IMediaComparison, INumericFeature | 'aspect-ratio', number]
  | readonly [IMediaComparison, IKeywordFeature, string]
  /** A size query against the nearest container, named or not */
  | readonly ['@', string | null, IMediaCondition];

export type IMediaEnvironment = Readonly<
  Record<INumericFeature, number> & Record<IKeywordFeature, string>
>;

export type IContainerAxis = 'width' | 'height';

export type IContainerSize = {
  readonly width: number;
  readonly height: number;
  /** Axes the container's own style leaves to its content, which a query may not read */
  readonly open?: readonly IContainerAxis[];
};

const BOTH_AXES: readonly IContainerAxis[] = ['width', 'height'];

// The axes a size feature reads, `aspect-ratio` and `orientation` reading both
const AXES_BY_FEATURE: ReadonlyMap<string, readonly IContainerAxis[]> = new Map([
  ['width', ['width']],
  ['height', ['height']],
  ['aspect-ratio', BOTH_AXES],
  ['orientation', BOTH_AXES],
]);

/** A condition that combines no others: a comparison or a container query */
export type IMediaLeaf = Exclude<
  IMediaCondition,
  readonly ['&' | '|', readonly IMediaCondition[]] | readonly ['!', IMediaCondition]
>;

/** Whether any leaf of the tree passes `test`, however deep the `and`, `or` and `not` nest */
export function someLeaf(
  condition: IMediaCondition,
  test: (leaf: IMediaLeaf) => boolean,
): boolean {
  switch (condition[0]) {
    case '&':
    case '|':
      return condition[1].some(child => someLeaf(child, test));
    case '!':
      return someLeaf(condition[1], test);
    default:
      return test(condition);
  }
}

function readsOpenAxis(condition: IMediaCondition, open: readonly IContainerAxis[]): boolean {
  return someLeaf(
    condition,
    leaf =>
      leaf[0] !== '@' &&
      (AXES_BY_FEATURE.get(leaf[1]) ?? []).some(axis => open.includes(axis)),
  );
}

/** The size of the container a node answers to, `undefined` when it has none */
export type IContainerLookup = (name: string | null) => IContainerSize | undefined;

type IFeatureReader = (feature: string) => number | string | undefined;

function compareNumbers(operator: IMediaComparison, actual: number, expected: number): boolean {
  switch (operator) {
    case '=':
      return actual === expected;
    case '>':
      return actual > expected;
    case '>=':
      return actual >= expected;
    case '<':
      return actual < expected;
    case '<=':
      return actual <= expected;
  }
}

function readEnvironment(env: IMediaEnvironment): IFeatureReader {
  return feature => {
    if (feature === 'aspect-ratio') return env.height === 0 ? undefined : env.width / env.height;
    if (isNumericFeature(feature)) return env[feature];
    return isKeywordFeature(feature) ? env[feature] : undefined;
  };
}

// A square container is portrait, as on the web, and a flat one has no ratio to compare
function readContainerSize({ width, height }: IContainerSize): IFeatureReader {
  const features: Readonly<Record<string, number | string | undefined>> = {
    width,
    height,
    'aspect-ratio': height === 0 ? undefined : width / height,
    orientation: height >= width ? 'portrait' : 'landscape',
  };
  return feature => features[feature];
}

function evaluate(
  condition: IMediaCondition,
  read: IFeatureReader,
  containerOf: IContainerLookup | undefined,
): boolean {
  switch (condition[0]) {
    case '&':
      return condition[1].every(child => evaluate(child, read, containerOf));
    case '|':
      return condition[1].some(child => evaluate(child, read, containerOf));
    case '!':
      return !evaluate(condition[1], read, containerOf);
    case '@': {
      const size = containerOf?.(condition[1]);
      if (size === undefined) return false;
      if (size.open !== undefined && readsOpenAxis(condition[2], size.open)) return false;
      return evaluate(condition[2], readContainerSize(size), undefined);
    }
    default: {
      const [operator, feature, expected] = condition;
      const actual = read(feature);
      if (typeof actual === 'number' && typeof expected === 'number') {
        return compareNumbers(operator, actual, expected);
      }
      return operator === '=' && actual === expected;
    }
  }
}

/** A condition with every window leaf answered, so only `@container` leaves are still open */
export type ISettledCondition =
  | boolean
  | readonly ['&' | '|', readonly ISettledCondition[]]
  | readonly ['!', ISettledCondition]
  | readonly ['@', string | null, IMediaCondition];

/** Without an environment nothing holds, as in `evaluateMedia` */
export function settleMedia(
  condition: IMediaCondition,
  env: IMediaEnvironment | undefined,
): ISettledCondition {
  switch (condition[0]) {
    case '&':
    case '|':
      return [condition[0], condition[1].map(child => settleMedia(child, env))];
    case '!':
      return ['!', settleMedia(condition[1], env)];
    case '@':
      return condition;
    default:
      return env !== undefined && evaluateMedia(condition, env);
  }
}

/** A `@container` leaf holds only when `containerOf` finds the container the node answers to */
export function evaluateMedia(
  condition: IMediaCondition,
  env: IMediaEnvironment,
  containerOf?: IContainerLookup,
): boolean {
  return evaluate(condition, readEnvironment(env), containerOf);
}
