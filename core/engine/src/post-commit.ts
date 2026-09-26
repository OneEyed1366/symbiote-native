// Run once after every commit that changed the tree, once fresh Fabric tags exist — lets a
// consumer needing a node's committed tag (the Animated native driver) retry work that ran too
// early under an async-batched commit. Shared by commit.ts and animated/props.ts, cycle-free.

type IPostCommitHook = () => void;

const hooks = new Set<IPostCommitHook>();

export function registerPostCommit(hook: IPostCommitHook): void {
  hooks.add(hook);
}

// The counterpart, needed the moment a hook belongs to something with a lifetime (a screen, a
// component) rather than to the process. Without it a mounted-and-gone consumer keeps running
// after every commit forever, holding its whole closure alive.
export function unregisterPostCommit(hook: IPostCommitHook): void {
  hooks.delete(hook);
}

export function runPostCommitHooks(): void {
  for (const hook of hooks) hook();
}
