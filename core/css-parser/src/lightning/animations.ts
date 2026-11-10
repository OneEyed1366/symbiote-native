// `@keyframes`, `animation` and `transition` as the style keys Reanimated's CSS support reads
// The keyframes of a name are written into the rule that uses it, so a rule needs no other one
import type { IStyleObject, IStyleValue } from './declarations.ts';

/** The steps of one `@keyframes` rule by offset: `from`, `to` or a percentage such as `50%` */
export type IKeyframesValue = { readonly [offset: string]: IStyleObject };

type IMotionItem = IKeyframesValue | string | number;

type IPlainValue = IStyleValue | IMotionItem | readonly IMotionItem[];

/** What the declarations of a rule write, animation keys included */
export type IPlainStyle = Record<string, IPlainValue>;

/** A rule's style, where a rule on a state writes each value under it */
export type IRuleStyle = Record<
  string,
  IPlainValue | { readonly [state: string]: IPlainValue }
>;

type IReader = (value: unknown) => IMotionItem | null;

type IKeys = Record<string, string>;

export type IKeyframesByName = ReadonlyMap<string, IKeyframesValue>;

const EASING_KEYWORDS = [
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'step-start',
  'step-end',
] as const;

type IEasingKeyword = (typeof EASING_KEYWORDS)[number];

const ANIMATION_KEYS: IKeys = {
  name: 'animationName',
  duration: 'animationDuration',
  timingFunction: 'animationTimingFunction',
  delay: 'animationDelay',
  iterationCount: 'animationIterationCount',
  direction: 'animationDirection',
  fillMode: 'animationFillMode',
  playState: 'animationPlayState',
};

const TRANSITION_KEYS: IKeys = {
  property: 'transitionProperty',
  duration: 'transitionDuration',
  timingFunction: 'transitionTimingFunction',
  delay: 'transitionDelay',
  behavior: 'transitionBehavior',
};

const MOTION_KEYS: Record<string, IKeys> = {
  animation: ANIMATION_KEYS,
  transition: TRANSITION_KEYS,
};

const NONE = 'none';
const PERCENTAGE = 'percentage';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function typeOf(value: unknown): string | null {
  return isObject(value) && typeof value.type === 'string' ? value.type : null;
}

function round(value: unknown): number | null {
  return typeof value === 'number' ? Number(value.toPrecision(7)) : null;
}

function camelCase(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

function isEasingKeyword(type: string): type is IEasingKeyword {
  return EASING_KEYWORDS.some(keyword => keyword === type);
}

function readTime(value: unknown): string | null {
  const amount = isObject(value) ? round(value.value) : null;
  if (amount === null) return null;
  const unit = typeOf(value);
  if (unit === 'seconds') return `${amount}s`;
  return unit === 'milliseconds' ? `${amount}ms` : null;
}

function readEasing(value: unknown): string | null {
  const type = typeOf(value);
  if (type === null || !isObject(value)) return null;
  if (isEasingKeyword(type)) return type;
  if (type === 'cubic-bezier') {
    const points = [value.x1, value.y1, value.x2, value.y2].map(round);
    return `cubic-bezier(${points.join(', ')})`;
  }
  if (type !== 'steps') return null;
  return `steps(${String(value.count)}, ${typeOf(value.position) ?? 'end'})`;
}

function readIterations(value: unknown): IMotionItem | null {
  if (typeOf(value) === 'infinite') return 'infinite';
  return isObject(value) ? round(value.value) : null;
}

function readWord(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

// The property as React Native spells it
function readProperty(value: unknown): string | null {
  const name = isObject(value) ? value.property : null;
  return typeof name === 'string' ? camelCase(name) : null;
}

const FIELD_READERS: Record<string, IReader> = {
  duration: readTime,
  delay: readTime,
  timingFunction: readEasing,
  iterationCount: readIterations,
  direction: readWord,
  playState: readWord,
  fillMode: readWord,
  behavior: readWord,
  property: readProperty,
};

// A name with keyframes in this file becomes them, any other stays the name for the runtime to find
function nameReader(keyframes: IKeyframesByName): IReader {
  return value => {
    if (typeOf(value) === NONE) return NONE;
    const name = isObject(value) ? value.value : null;
    return typeof name === 'string' ? (keyframes.get(name) ?? name) : null;
  };
}

// One value stays one value, which is how an author reads a single animation
function listOf(items: ReadonlyArray<IMotionItem | null>) {
  const read = items.filter((item): item is IMotionItem => item !== null);
  const [first] = read;
  if (first === undefined) return null;
  return read.length === 1 ? first : read;
}

function assemble(
  keys: IKeys,
  entries: ReadonlyArray<readonly [string, ReadonlyArray<unknown>]>,
  name: IReader,
): IPlainStyle {
  const style: IPlainStyle = {};
  for (const [field, values] of entries) {
    const read = field === 'name' ? name : FIELD_READERS[field];
    const key = keys[field];
    const list = read === undefined ? null : listOf(values.map(read));
    if (key !== undefined && list !== null) style[key] = list;
  }
  return style;
}

// A shorthand holds one object per animation, a longhand one value per animation
function shorthandEntries(keys: IKeys, items: unknown) {
  const list = Array.isArray(items) ? items : [];
  return Object.keys(keys).map(
    field =>
      [field, list.map(item => (isObject(item) ? item[field] : null))] as const,
  );
}

/** Whether the key is one an `animation` or `transition` declaration writes */
export function isMotionKey(key: string): boolean {
  return [ANIMATION_KEYS, TRANSITION_KEYS].some(keys =>
    Object.values(keys).includes(key),
  );
}

/** The style keys of an `animation` or `transition`, or null for any other declaration */
export function motionToStyle(
  declaration: unknown,
  keyframes: IKeyframesByName,
): IPlainStyle | null {
  if (!isObject(declaration) || typeof declaration.property !== 'string') {
    return null;
  }
  const [family = '', ...longhand] = declaration.property.split('-');
  const keys = MOTION_KEYS[family];
  if (keys === undefined) return null;
  const name = nameReader(keyframes);
  if (longhand.length === 0) {
    return assemble(keys, shorthandEntries(keys, declaration.value), name);
  }
  const values = Array.isArray(declaration.value) ? declaration.value : [];
  return assemble(keys, [[camelCase(longhand.join('-')), values]], name);
}

function offsetOf(selector: unknown): string | null {
  const type = typeOf(selector);
  if (type === 'from' || type === 'to') return type;
  const fraction = isObject(selector) ? round(selector.value) : null;
  if (type !== PERCENTAGE || fraction === null) return null;
  return `${Number((fraction * 100).toPrecision(7))}%`;
}

function listIn(value: unknown, key: string): unknown[] {
  const list = isObject(value) ? value[key] : null;
  return Array.isArray(list) ? list : [];
}

/**
 * The name and steps of a `@keyframes` rule; `step` turns one declaration of a step into style
 */
export function keyframesOf(
  rule: unknown,
  step: (declaration: unknown) => IStyleObject,
): { name: string; steps: IKeyframesValue } | null {
  const name = isObject(rule) && isObject(rule.name) ? rule.name.value : null;
  if (typeof name !== 'string') return null;
  const steps: Record<string, IStyleObject> = {};
  for (const frame of listIn(rule, 'keyframes')) {
    const declarations = isObject(frame) ? frame.declarations : null;
    const style = listIn(declarations, 'declarations').reduce<IStyleObject>(
      (all, declaration) => ({ ...all, ...step(declaration) }),
      {},
    );
    for (const selector of listIn(frame, 'selectors')) {
      const offset = offsetOf(selector);
      if (offset !== null) steps[offset] = { ...steps[offset], ...style };
    }
  }
  return { name, steps };
}
