// Runs `cleanup` when the component, or the effect root a test made, is gone. An effect with
// nothing to track runs once, and what it returns is its teardown
export function onCleanup(cleanup: () => void): void {
  $effect(() => cleanup);
}
