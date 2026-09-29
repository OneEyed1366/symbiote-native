// Framework-agnostic merge-stack over multiple mounted `<NavigationBar>` declarative components,
// ported from expo-navigation-bar's NavigationBar.android.ts - the last pushed (or deepest in the
// view hierarchy) entry wins on shared fields, matching upstream's own priority rule

import {
  defaultNavigationBarProps,
  setHidden,
  setStyle,
} from './navigation-bar';
import type { INavigationBarProps } from './types';

export type INavigationBarStackEntry = INavigationBarProps;

const entriesStack: INavigationBarStackEntry[] = [];
let updateImmediate: ReturnType<typeof setImmediate> | null = null;

function mergeEntriesStack(
  stack: readonly INavigationBarStackEntry[],
): INavigationBarProps {
  return stack.reduce<INavigationBarProps>(
    (prev, cur) => ({
      style: cur.style ?? prev.style,
      hidden: cur.hidden ?? prev.hidden,
    }),
    {},
  );
}

function createStackEntry(
  props: INavigationBarProps,
): INavigationBarStackEntry {
  return { style: props.style, hidden: props.hidden };
}

function updateEntriesStack(): void {
  if (updateImmediate != null) clearImmediate(updateImmediate);
  updateImmediate = setImmediate(() => {
    if (entriesStack.length === 0) {
      setStyle(defaultNavigationBarProps.style);
      setHidden(defaultNavigationBarProps.hidden);
      return;
    }
    const { style, hidden } = mergeEntriesStack(entriesStack);
    if (style != null) setStyle(style);
    if (hidden != null) setHidden(hidden);
  });
}

/** Registers a mounted `<NavigationBar>` entry */
export function pushStackEntry(
  props: INavigationBarProps,
): INavigationBarStackEntry {
  const entry = createStackEntry(props);
  entriesStack.push(entry);
  updateEntriesStack();
  return entry;
}

/** Unregisters an entry, falling back to the previous entries or the last imperative call */
export function popStackEntry(entry: INavigationBarStackEntry): void {
  const index = entriesStack.indexOf(entry);
  if (index !== -1) entriesStack.splice(index, 1);
  updateEntriesStack();
}

/** Swaps an entry's props in place, for a mounted component's own prop changes */
export function replaceStackEntry(
  entry: INavigationBarStackEntry,
  props: INavigationBarProps,
): INavigationBarStackEntry {
  const newEntry = createStackEntry(props);
  const index = entriesStack.indexOf(entry);
  if (index !== -1) entriesStack[index] = newEntry;
  updateEntriesStack();
  return newEntry;
}
