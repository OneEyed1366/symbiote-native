// RN's `StatusBar.js` stack: every mounted StatusBar pushes an entry, the last one that set a prop
// wins it, and native is told the merged result once per frame
// A platform hands in its defaults and how a merged result reaches its native module

import {
  type IStatusBarEntryHandle,
  type IStatusBarMerged,
  type IStatusBarProps,
  type IStatusBarStackEntry,
} from './shared';

export type IStatusBarDriver = {
  createDefaults(): IStatusBarMerged;
  // `previous` is null before the first flush, which sends every value
  flush(previous: IStatusBarMerged | null, merged: IStatusBarMerged): void;
};

export function createStackEntry(props: IStatusBarProps): IStatusBarStackEntry {
  const animated = props.animated ?? false;
  return {
    backgroundColor:
      props.backgroundColor == null
        ? null
        : { value: props.backgroundColor, animated },
    barStyle:
      props.barStyle == null ? null : { value: props.barStyle, animated },
    translucent: props.translucent,
    hidden:
      props.hidden == null
        ? null
        : {
            value: props.hidden,
            animated,
            transition: props.showHideTransition ?? 'fade',
          },
    networkActivityIndicatorVisible: props.networkActivityIndicatorVisible,
  };
}

// A shallow copy of the defaults, so an untouched field is the very object the defaults hold
function mergeEntries(
  entries: readonly IStatusBarStackEntry[],
  defaults: IStatusBarMerged,
): IStatusBarMerged {
  const merged = { ...defaults };
  for (const entry of entries) {
    if (entry.backgroundColor != null) {
      merged.backgroundColor = entry.backgroundColor;
    }
    if (entry.barStyle != null) merged.barStyle = entry.barStyle;
    if (entry.translucent != null) merged.translucent = entry.translucent;
    if (entry.hidden != null) merged.hidden = entry.hidden;
    if (entry.networkActivityIndicatorVisible != null) {
      merged.networkActivityIndicatorVisible =
        entry.networkActivityIndicatorVisible;
    }
  }
  return merged;
}

// RN sends the update from `setImmediate`, where a host has none a 0ms timer stands in
function scheduleEndOfFrame(task: () => void): () => void {
  const immediate = Reflect.get(globalThis, 'setImmediate');
  if (typeof immediate === 'function') {
    const handle = immediate(task);
    return () => Reflect.get(globalThis, 'clearImmediate')(handle);
  }
  const handle = Reflect.get(globalThis, 'setTimeout')(task, 0);
  return () => Reflect.get(globalThis, 'clearTimeout')(handle);
}

export function createStatusBarStack(driver: IStatusBarDriver) {
  const entries: IStatusBarStackEntry[] = [];
  let defaults: IStatusBarMerged | undefined;
  let current: IStatusBarMerged | null = null;
  let cancelPending: (() => void) | undefined;

  // Lazy, the Android defaults ask the native module
  function getDefaults(): IStatusBarMerged {
    defaults ??= driver.createDefaults();
    return defaults;
  }

  function scheduleFlush(): void {
    cancelPending?.();
    cancelPending = scheduleEndOfFrame(() => {
      const merged = mergeEntries(entries, getDefaults());
      driver.flush(current, merged);
      current = merged;
    });
  }

  function push(props: IStatusBarProps): IStatusBarStackEntry {
    const entry = createStackEntry(props);
    entries.push(entry);
    scheduleFlush();
    return entry;
  }

  function pop(entry: IStatusBarStackEntry): void {
    const index = entries.indexOf(entry);
    if (index !== -1) entries.splice(index, 1);
    scheduleFlush();
  }

  function replace(
    entry: IStatusBarStackEntry,
    props: IStatusBarProps,
  ): IStatusBarStackEntry {
    const next = createStackEntry(props);
    const index = entries.indexOf(entry);
    if (index !== -1) entries[index] = next;
    scheduleFlush();
    return next;
  }

  // One mounted StatusBar: the first `apply` pushes, the rest replace its own entry
  function createEntry(): IStatusBarEntryHandle {
    let own: IStatusBarStackEntry | undefined;
    return {
      apply(props) {
        own = own === undefined ? push(props) : replace(own, props);
      },
      release() {
        if (own !== undefined) pop(own);
        own = undefined;
      },
    };
  }

  return { getDefaults, push, pop, replace, createEntry };
}
