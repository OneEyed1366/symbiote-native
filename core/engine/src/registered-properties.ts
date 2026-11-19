// `CSS.registerProperty` and the `@property` rules of compiled CSS, typed in native
// The web order holds: `registerProperty` wins, a later rule beats an earlier one, and a rule
// inside `@media` counts only while its condition holds

import { noteHostSideChange } from './mutation-buffer';
import { nativeEngine } from './native-engine';
import {
  holdsCondition,
  internConditions,
} from './style-registry/media-conditions';
import type { IMediaCondition } from './style-registry/media-evaluate';
import { onConditionFlip } from './style-registry/media-subscriptions';
import { flushOps } from './tree-host';

export type IPropertyDescriptor = {
  readonly name: string;
  readonly syntax: string;
  readonly inherits: boolean;
  readonly initialValue?: string;
};

/** A compiled `@property` rule, `cond` indexing the condition table passed beside it */
export type ICompiledProperty = IPropertyDescriptor & {
  readonly cond?: number;
};

type IRule = {
  readonly descriptor: IPropertyDescriptor;
  readonly condId: number | undefined;
};

const CUSTOM_PROPERTY_PREFIX = '--';
const OUTCOME_REGISTERED = 0;
const OUTCOME_BAD_NAME = 1;
const OUTCOME_ALREADY_REGISTERED = 5;
// This file's own code for a build whose binding is missing, apart from the native outcomes
const OUTCOME_NO_BINDING = -1;

// Indexed by the native `RegisterOutcome`, where 0 is a registration that succeeded
const FAILURES: readonly ((descriptor: IPropertyDescriptor) => string)[] = [
  () => '',
  ({ name }) => `registerProperty: "${name}" is not a custom property (--name)`,
  ({ syntax }) => `registerProperty: "${syntax}" is not a valid syntax`,
  ({ name, syntax }) =>
    `registerProperty: "${name}" needs an initialValue for syntax "${syntax}"`,
  ({ initialValue, syntax }) =>
    `registerProperty: initialValue "${initialValue}" does not match syntax "${syntax}"`,
  ({ name }) => `registerProperty: "${name}" is already registered`,
];

// The compiled rules in load order, so a later one wins
const rules: IRule[] = [];
// The names `registerProperty` holds, which no rule may replace
const registered = new Set<string>();
// What native holds for a rule, so a change touches only the names that differ
const applied = new Map<string, IPropertyDescriptor>();
const watched = new Set<number>();
const warned = new Set<string>();

function failureOf(outcome: number, descriptor: IPropertyDescriptor): string {
  if (outcome === OUTCOME_NO_BINDING) {
    return 'registerProperty: this native build predates typed properties';
  }
  return (
    FAILURES[outcome]?.(descriptor) ??
    `registerProperty: unknown outcome ${outcome}`
  );
}

function outcomeOf(descriptor: IPropertyDescriptor): number {
  if (!descriptor.name.startsWith(CUSTOM_PROPERTY_PREFIX))
    return OUTCOME_BAD_NAME;
  flushOps();
  const register = nativeEngine()?.registerProperty;
  if (register === undefined) return OUTCOME_NO_BINDING;
  const outcome = register(
    descriptor.name,
    descriptor.syntax,
    descriptor.inherits,
    descriptor.initialValue,
  );
  // Readers were marked dirty natively, and no op names them, so the next commit must not look idle
  if (outcome === OUTCOME_REGISTERED) noteHostSideChange();
  return outcome;
}

function unregisterNative(name: string): void {
  flushOps();
  if (nativeEngine()?.unregisterProperty?.(name) === true) noteHostSideChange();
}

function ruleKey({ descriptor, condId }: IRule): string {
  const { name, syntax, inherits, initialValue } = descriptor;
  return JSON.stringify([name, syntax, inherits, initialValue, condId]);
}

function winnerOf(name: string): IRule | undefined {
  for (let at = rules.length - 1; at >= 0; at -= 1) {
    const rule = rules[at];
    if (rule?.descriptor.name !== name) continue;
    if (rule.condId === undefined || holdsCondition(rule.condId)) return rule;
  }
  return undefined;
}

// Brings native to the rule that wins for `name` now
// A rule native refuses is dropped for good, as a browser ignores an invalid `@property`
function settleRule(name: string): void {
  if (registered.has(name)) return;
  let winner = winnerOf(name);
  const current = applied.get(name);
  if (current !== undefined && winner?.descriptor === current) return;
  if (current !== undefined) {
    unregisterNative(name);
    applied.delete(name);
  }
  while (winner !== undefined) {
    const outcome = outcomeOf(winner.descriptor);
    if (outcome === OUTCOME_REGISTERED) {
      applied.set(name, winner.descriptor);
      return;
    }
    const message = failureOf(outcome, winner.descriptor);
    if (!warned.has(message)) console.warn(message);
    warned.add(message);
    rules.splice(rules.indexOf(winner), 1);
    winner = winnerOf(name);
  }
}

function settleRules(): void {
  for (const name of new Set(rules.map(rule => rule.descriptor.name))) {
    settleRule(name);
  }
}

function watch(condId: number | undefined): void {
  if (condId === undefined || watched.has(condId)) return;
  watched.add(condId);
  onConditionFlip(condId, settleRules);
}

/** Types `name` for every surface. Throws what `CSS.registerProperty` would throw */
export function registerProperty(descriptor: IPropertyDescriptor): void {
  const { name } = descriptor;
  if (registered.has(name)) {
    throw new Error(failureOf(OUTCOME_ALREADY_REGISTERED, descriptor));
  }
  const displaced = applied.get(name);
  if (displaced !== undefined) unregisterNative(name);
  const outcome = outcomeOf(descriptor);
  if (outcome === OUTCOME_REGISTERED) {
    registered.add(name);
    applied.delete(name);
    return;
  }
  // The rule that held the name keeps it when the descriptor is refused
  if (displaced !== undefined) outcomeOf(displaced);
  throw new Error(failureOf(outcome, descriptor));
}

/**
 * The `@property` rules of one compiled file, registered as the module loads
 * A repeat is silent (hot reload evaluates a module again) and a bad rule warns, not throws
 */
export function registerProperties(
  compiled: readonly ICompiledProperty[],
  conditions: readonly IMediaCondition[] = [],
): void {
  const conditionIds = internConditions(conditions);
  const known = new Set(rules.map(ruleKey));
  const touched = new Set<string>();
  for (const { cond, ...descriptor } of compiled) {
    const condId = cond === undefined ? undefined : conditionIds[cond];
    // A condition the table lacks is an unknown one, so the rule never applies
    if (cond !== undefined && condId === undefined) continue;
    const rule = { descriptor, condId };
    watch(condId);
    if (known.has(ruleKey(rule))) continue;
    rules.push(rule);
    touched.add(descriptor.name);
  }
  for (const name of touched) settleRule(name);
}

/** Forgets every registration. Used between tests, like `clearGlobalStyles` */
export function clearRegisteredProperties(): void {
  nativeEngine()?.clearRegisteredProperties?.();
  rules.length = 0;
  registered.clear();
  applied.clear();
  watched.clear();
  warned.clear();
}
