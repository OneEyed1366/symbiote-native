// The registry's table of `@media` conditions: one id and one truth value per distinct condition
// Two files declaring the same condition share an id, so a flip is detected once

import {
  evaluateMedia,
  settleMedia,
  someLeaf,
  type IContainerLookup,
  type IMediaCondition,
  type IMediaEnvironment,
  type ISettledCondition,
} from './media-evaluate';

const conditions: IMediaCondition[] = [];
const idByText = new Map<string, number>();
const truth: boolean[] = [];
// Conditions with a `@container` leaf: their answer belongs to a node, so `truth` never holds one
const containerIds = new Set<number>();
let environment: IMediaEnvironment | undefined;

function usesContainer(condition: IMediaCondition): boolean {
  return someLeaf(condition, leaf => leaf[0] === '@');
}

function isSameEnvironment(
  previous: IMediaEnvironment | undefined,
  next: IMediaEnvironment,
): boolean {
  if (previous === undefined) return false;
  return Object.entries(next).every(([name, value]) =>
    Object.is(Reflect.get(previous, name), value),
  );
}

export function isContainerCondition(id: number): boolean {
  return containerIds.has(id);
}

// False for an app with no `@container` rule, which lets every container step stay out of the way
export function hasContainerConditions(): boolean {
  return containerIds.size > 0;
}

// Ids for one file's conditions, in the order the file lists them
export function internConditions(
  fileConditions: readonly IMediaCondition[],
): number[] {
  return fileConditions.map(condition => {
    const text = JSON.stringify(condition);
    const known = idByText.get(text);
    if (known !== undefined) return known;

    const id = conditions.length;
    conditions.push(condition);
    idByText.set(text, id);
    if (usesContainer(condition)) containerIds.add(id);
    truth.push(environment !== undefined && evaluateMedia(condition, environment));
    return id;
  });
}

// The ids whose truth value changed under the new snapshot
// A container condition may read the environment too, so any change reports it for a re-resolve
export function updateEnvironment(next: IMediaEnvironment): number[] {
  const hasChanged = !isSameEnvironment(environment, next);
  environment = next;
  const flipped: number[] = [];

  for (const [id, condition] of conditions.entries()) {
    if (containerIds.has(id)) {
      if (hasChanged) flipped.push(id);
      continue;
    }
    const holds = evaluateMedia(condition, next);
    if (holds === truth[id]) continue;
    truth[id] = holds;
    flipped.push(id);
  }
  return flipped;
}

// Without an environment nothing holds, so a conditional rule stays off
// A container condition is read per node, through the lookup of the container that node answers to
export function holdsCondition(id: number, containerOf?: IContainerLookup): boolean {
  if (!containerIds.has(id)) return truth[id] === true;
  const condition = conditions[id];
  return (
    condition !== undefined &&
    environment !== undefined &&
    evaluateMedia(condition, environment, containerOf)
  );
}

// A condition nobody interned, read against the window as it is now
export function holdsOnce(condition: IMediaCondition): boolean {
  return environment !== undefined && evaluateMedia(condition, environment);
}

// The condition with the window already answered, for a host that evaluates the container leaves
export function settledConditionOf(id: number): ISettledCondition {
  const condition = conditions[id];
  return condition === undefined ? false : settleMedia(condition, environment);
}

// Class strings whose resolution read a condition, so a flip drops only those cache entries
const keysByCondition = new Map<number, Set<string>>();

// The other direction, so a node can subscribe to the conditions its class read
const idsByKey = new Map<string, Set<number>>();

export function trackDependents(key: string, deps: ReadonlySet<number>): void {
  if (deps.size === 0) return;
  const ids = idsByKey.get(key) ?? new Set<number>();
  idsByKey.set(key, ids);
  for (const id of deps) {
    ids.add(id);
    const keys = keysByCondition.get(id);
    if (keys === undefined) keysByCondition.set(id, new Set([key]));
    else keys.add(key);
  }
}

/** Forgets what a class string read, so the two tables stay as small as the caches they serve */
export function untrackDependents(key: string): void {
  for (const id of idsByKey.get(key) ?? []) keysByCondition.get(id)?.delete(key);
  idsByKey.delete(key);
}

export function conditionIdsOfKey(key: string): ReadonlySet<number> | undefined {
  return idsByKey.get(key);
}

// False for an app with no `@media` rule, which lets the node path skip every subscription step
export function hasConditions(): boolean {
  return conditions.length > 0;
}

export function dependentKeys(flipped: readonly number[]): Set<string> {
  const keys = new Set<string>();
  for (const id of flipped) {
    for (const key of keysByCondition.get(id) ?? []) keys.add(key);
  }
  return keys;
}

export function forgetDependents(): void {
  keysByCondition.clear();
  idsByKey.clear();
}

export function resetConditions(): void {
  conditions.length = 0;
  idByText.clear();
  truth.length = 0;
  containerIds.clear();
  environment = undefined;
  forgetDependents();
}
