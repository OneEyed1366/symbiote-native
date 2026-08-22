// Post-commit hooks: run once after every native commit that changed the tree (after
// completeRoot, when fresh Fabric tags have just been assigned). The seam exists so a
// consumer that needs a node's committed tag — today only the Animated native driver,
// which binds a props node to a view tag — can retry work that ran too early under an
// async-batched commit (Vue/Svelte schedule completeRoot on a microtask, so lifecycle
// code can reach a node before its tag exists; React commits synchronously and never
// queues). A neutral module so commit.ts and animated/props.ts share it without a
// dependency cycle.

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
