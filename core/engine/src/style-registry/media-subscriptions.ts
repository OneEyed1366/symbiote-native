// Which nodes restyle when a media condition flips: each node subscribes to the conditions its
// class read, and an environment change re-pushes only the nodes of a condition that flipped
// The re-push itself is passed in by `node-route.ts`, so this module never imports the node types

import { unlinkConsumer } from '../container-tracking';
import {
  conditionIdsOf,
  setMediaEnvironment,
  type IClassNameValue,
} from './index';
import type { IMediaEnvironment } from './media-evaluate';

// Nodes are plain `object` here, since the node types reach `node-route.ts` back and would close
// a cycle through the class path
const nodesByCondition = new Map<number, Set<object>>();
const idsByNode = new WeakMap<object, readonly number[]>();
// Run after the nodes restyled, so a handler reads the styles the flip produced
const flipListeners = new Map<number, Set<() => void>>();

// Nodes whose release mark was already recorded, so the mark crosses to native once per node
let marked = new WeakSet<object>();
// Subscribed nodes a detach sweep released, so only they restyle when the framework puts them back
let released = new WeakSet<object>();
let anySubscribed = false;
let restyler: (node: object) => void = () => {};

// The accessibility follower reaches the node types, so the surface hands its starter in here
let accessibilityStarter: (() => void) | undefined;
let isAccessibilityWanted = false;

export function requestMediaAccessibility(): void {
  isAccessibilityWanted = true;
  accessibilityStarter?.();
}

// A request made before any surface existed runs as soon as the starter arrives
export function setMediaAccessibilityStarter(start: () => void): void {
  accessibilityStarter = start;
  if (isAccessibilityWanted) start();
}

// Read on every removal, so the sweep only nominates nodes when something could be subscribed
export function hasMediaSubscribers(): boolean {
  return anySubscribed;
}

function unsubscribe(node: object): void {
  const ids = idsByNode.get(node);
  if (ids === undefined) return;
  for (const id of ids) nodesByCondition.get(id)?.delete(node);
  idsByNode.delete(node);
}

// Replaces the node's subscriptions with the conditions this class value read when it resolved
// The `restyle` is kept, since a flip and a return both re-push a node. Answers whether the node
// still needs its release mark, which is recorded once so the narrowed teardown walk returns it
export function watchMediaClass(
  node: object,
  className: IClassNameValue,
  restyle: (node: object) => void,
): boolean {
  unsubscribe(node);
  const ids = conditionIdsOf(className);
  if (ids.length === 0) return false;
  anySubscribed = true;
  restyler = restyle;
  idsByNode.set(node, ids);
  for (const id of ids) {
    const nodes = nodesByCondition.get(id);
    if (nodes === undefined) nodesByCondition.set(id, new Set([node]));
    else nodes.add(node);
  }
  if (marked.has(node)) return false;
  marked.add(node);
  return true;
}

// Calls `listener` whenever the condition flips, until the returned function is called
export function onConditionFlip(id: number, listener: () => void): () => void {
  const listeners = flipListeners.get(id) ?? new Set<() => void>();
  flipListeners.set(id, listeners);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && flipListeners.get(id) === listeners)
      flipListeners.delete(id);
  };
}

// A listener of the app that throws is reported and must not keep the rest from the flip
export function callIsolated(listener: () => void): void {
  try {
    listener();
  } catch (error) {
    console.error(error);
  }
}

// Hands the registry the new snapshot, then re-pushes the nodes of the conditions that flipped
// The nodes are copied first, since a restyle re-subscribes while the walk is running
export function applyMediaEnvironment(env: IMediaEnvironment): void {
  const nodes = new Set<object>();
  const flipped = setMediaEnvironment(env);
  for (const id of flipped) {
    for (const node of nodesByCondition.get(id) ?? []) nodes.add(node);
  }
  for (const node of nodes) restyler(node);
  for (const id of flipped) {
    const listeners = flipListeners.get(id);
    if (listeners === undefined) continue;
    // Walks a snapshot, and skips a listener that left while the walk ran
    for (const listener of Array.from(listeners)) {
      if (listeners.has(listener)) callIsolated(listener);
    }
  }
}

// The detach sweep calls this for every node that genuinely left, with or without a class
export function releaseMediaNode(node: object): void {
  if (!idsByNode.has(node)) return;
  released.add(node);
  unsubscribe(node);
  // The containers above it may change while it is away, so it links again on return
  unlinkConsumer(node);
}

// Runs once per release, so a returning node re-pushes a single time
export function restoreMediaNode(node: object): void {
  if (released.delete(node)) restyler(node);
}

// Test-only, since the subscriptions are module state
export function resetMediaSubscriptions(): void {
  nodesByCondition.clear();
  flipListeners.clear();
  marked = new WeakSet();
  released = new WeakSet();
  anySubscribed = false;
  isAccessibilityWanted = false;
  restyler = () => {};
}
