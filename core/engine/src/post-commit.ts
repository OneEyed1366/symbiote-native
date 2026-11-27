// Post hooks run after every commit that changed the tree, once fresh Fabric tags exist.
// The Animated native driver retries there what ran too early under an async-batched commit

type ICommitHook = () => void;

const hooks = new Set<ICommitHook>();
const preHooks = new Set<ICommitHook>();

// Runs as a commit starts, so its writes still ride that commit. `registerBeforeFlush` fires on
// reads too, in the middle of a render, which is too early for a verdict a later write can change
export function registerPreCommit(hook: ICommitHook): void {
  preHooks.add(hook);
}

export function unregisterPreCommit(hook: ICommitHook): void {
  preHooks.delete(hook);
}

export function runPreCommitHooks(): void {
  for (const hook of preHooks) hook();
}

export function registerPostCommit(hook: ICommitHook): void {
  hooks.add(hook);
}

// The counterpart, needed the moment a hook belongs to something with a lifetime (a screen, a
// component) rather than to the process. Without it a mounted-and-gone consumer keeps running
// after every commit forever, holding its whole closure alive
export function unregisterPostCommit(hook: ICommitHook): void {
  hooks.delete(hook);
}

export function runPostCommitHooks(): void {
  for (const hook of hooks) hook();
}
