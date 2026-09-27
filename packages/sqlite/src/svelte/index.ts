// @symbiote-native/sqlite/svelte: SQLiteProvider + useSQLiteContext over the framework-agnostic
// core. Mirrors packages/navigation/src/svelte/index.ts's barrel shape for a `.svelte` component.

export * from '../core';
export { default as SQLiteProvider } from './SQLiteProvider.svelte';
export * from './sqlite-context';
