import type { IReadAccessor } from '../worklet-snapshot';

// What a framework whose setup runs once supplies, and everything else is shared
export type ISetupOnceLifecycle = {
  // Runs `dispose` when the component, or the scope that made the composable, is gone
  onDispose: (dispose: () => void) => void;
  // Runs `restart` now, and again after a change in what `updater` reads, until the scope is gone
  followInScope: (updater: () => unknown, restart: () => void) => void;
  // For a framework whose reactive values are functions, such as a signal: the value one holds
  readAccessor?: IReadAccessor;
};
