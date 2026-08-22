// Hand-ported from .vendors/expo/packages/expo-keep-awake/src/index.ts (sdk-57, confirmed
// against origin/sdk-57 — the .vendors/expo working tree sits on `main` and differs
// cosmetically). Unlike battery (which falls back to a sentinel when a method is missing),
// upstream keep-awake throws from `addListener` when the native module lacks
// `addListenerForTag`, matching local-auth/haptics's UnavailabilityError convention.
import { UnavailabilityError, type EventSubscription } from 'expo-modules-core';
import { expoKeepAwake } from './native-module';
import type { KeepAwakeListener } from './types';

export const ExpoKeepAwakeTag = 'ExpoKeepAwakeDefaultTag';

/** Resolves with whether the keep-awake API is available on this device. */
export async function isAvailableAsync(): Promise<boolean> {
  if (expoKeepAwake.isAvailableAsync) {
    return await expoKeepAwake.isAvailableAsync();
  }
  return true;
}

/**
 * Activates a keep-awake lock under `tag` (the shared default tag when none is given) — the
 * screen stays on for as long as any tag holds an active lock.
 */
export async function activateKeepAwakeAsync(
  tag: string = ExpoKeepAwakeTag,
): Promise<void> {
  await expoKeepAwake.activate?.(tag);
}

/** Releases the keep-awake lock held under `tag` (the shared default tag when none is given). */
export async function deactivateKeepAwake(
  tag: string = ExpoKeepAwakeTag,
): Promise<void> {
  await expoKeepAwake.deactivate?.(tag);
}

/**
 * Subscribes to keep-awake state changes for a tag. Overloaded to accept a bare listener for the
 * default tag, matching upstream's own `addListener` signature.
 */
export function addListener(
  tagOrListener: string | KeepAwakeListener,
  listener?: KeepAwakeListener,
): EventSubscription {
  if (!expoKeepAwake.addListenerForTag) {
    throw new UnavailabilityError('ExpoKeepAwake', 'addListenerForTag');
  }
  const tag =
    typeof tagOrListener === 'string' ? tagOrListener : ExpoKeepAwakeTag;
  const resolvedListener =
    typeof tagOrListener === 'function' ? tagOrListener : listener;
  if (!resolvedListener) {
    throw new TypeError('addListener requires a listener function');
  }
  return expoKeepAwake.addListenerForTag(tag, resolvedListener);
}
