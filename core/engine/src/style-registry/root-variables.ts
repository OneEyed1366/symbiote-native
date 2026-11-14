// The `:root` custom properties of every loaded stylesheet, one process-wide cascade
// A declaration inside `@media` counts only while its condition holds, so the table is derived on
// read from the live condition truth and never stored

import {
  recordRemoveGlobalVariable,
  recordSetGlobalVariable,
} from '../mutation-buffer';
import { holdsCondition, internConditions } from './media-conditions';
import type { IMediaCondition } from './media-evaluate';

export type IRootVariable = {
  readonly name: string;
  readonly value: string;
  /** Index into the `conditions` table passed beside the variables */
  readonly cond?: number;
};

type IEntry = {
  readonly name: string;
  readonly value: string;
  readonly condId: number | undefined;
};

const entries: IEntry[] = [];

// What native holds right now, so a change sends only the names that differ
const published = new Map<string, string>();

// Conditions are interned with the rules' own table, so a flip is detected once for both
export function registerRootVariables(
  variables: readonly IRootVariable[],
  conditions: readonly IMediaCondition[] = [],
): void {
  const conditionIds = internConditions(conditions);
  for (const { name, value, cond } of variables) {
    const condId = cond === undefined ? undefined : conditionIds[cond];
    entries.push({ name, value, condId });
  }
  publishRootVariables();
}

/** The winning value per name under the current environment, later declarations over earlier */
export function rootVariableTable(): ReadonlyMap<string, string> {
  const table = new Map<string, string>();
  for (const { name, value, condId } of entries) {
    if (condId === undefined || holdsCondition(condId)) table.set(name, value);
  }
  return table;
}

// Sends native the names whose winning value differs from what it holds
// Runs after a registration and after a condition flip, so no node has to subscribe to a `:root`
export function publishRootVariables(): void {
  if (entries.length === 0) return;
  const table = rootVariableTable();
  for (const [name, value] of table) {
    if (published.get(name) === value) continue;
    published.set(name, value);
    recordSetGlobalVariable(name, value);
  }
  for (const name of published.keys()) {
    if (table.has(name)) continue;
    published.delete(name);
    recordRemoveGlobalVariable(name);
  }
}

// Test seam: native is told to drop every name it holds, so the next registry starts empty
export function clearRootVariables(): void {
  for (const name of published.keys()) recordRemoveGlobalVariable(name);
  entries.length = 0;
  published.clear();
}
