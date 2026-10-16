import { initialUpdaterRun } from 'react-native-reanimated/src/animation';

// A framework's way to run `read` and learn what it reads: Vue's `watch`, Solid's `createComputed`,
// Svelte's `$effect`, Angular's `effect`. `onChange` is called when any of it changes
export type ITrack = (read: () => void, onChange: () => void) => () => void;

// The mapper of a setup-once framework starts now and starts again, over a fresh snapshot of the
// closure, when something its updater reads changes
export function followReads(
  track: ITrack,
  read: () => void,
  restart: () => void,
): () => void {
  restart();
  return track(read, restart);
}

// What a framework's `followInScope` is: follow what `updater` reads, until the scope is gone
export function followUpdaterIn(
  track: ITrack,
  onDispose: (dispose: () => void) => void,
) {
  return (updater: () => unknown, restart: () => void): void =>
    onDispose(followReads(track, () => initialUpdaterRun(updater), restart));
}
