// Something a library holds against a native view follows the node's Fabric family, so it is
// attached after the first commit, attached again when a reparent re-creates the family and let go
// when the node leaves the tree
import { getFamilyGeneration, whenCommitted } from './imperative';
import { noteNodeBinding } from './node-binding-gate';
import { registerPostCommit, unregisterPostCommit } from './post-commit';
import type { ISymbioteNode } from './node-types';

type IBinding = {
  attach: () => (() => void) | undefined;
  cancel: () => void;
  release: (() => void) | undefined;
  // The family the binding attached against, which a reparent can replace under the same tag
  generation: number | undefined;
};

const bindings = new WeakMap<ISymbioteNode, Set<IBinding>>();
// Strong, because the post-commit check has to walk them; emptied by every way out of `bindings`
const watched = new Set<ISymbioteNode>();

function attachBinding(node: ISymbioteNode, binding: IBinding): void {
  binding.release = binding.attach();
  binding.generation = getFamilyGeneration(node);
}

// Only a bound node is asked, and a host that reports no generation never triggers a rebind
function rebindChangedFamilies(): void {
  for (const node of watched) {
    const generation = getFamilyGeneration(node);
    if (generation === undefined) continue;
    for (const binding of bindings.get(node) ?? []) {
      if (
        binding.generation === undefined ||
        binding.generation === generation
      ) {
        continue;
      }
      binding.release?.();
      attachBinding(node, binding);
    }
  }
}

function forget(node: ISymbioteNode, binding: IBinding): void {
  const standing = bindings.get(node);
  standing?.delete(binding);
  if (standing === undefined || standing.size > 0) return;
  bindings.delete(node);
  watched.delete(node);
  if (watched.size === 0) unregisterPostCommit(rebindChangedFamilies);
}

function unbind(node: ISymbioteNode, binding: IBinding): void {
  binding.cancel();
  const release = binding.release;
  binding.release = undefined;
  release?.();
  forget(node, binding);
}

// `attach` may return the release for what it set up. The returned function is safe to call twice
export function bindToNode(
  node: ISymbioteNode,
  attach: () => (() => void) | undefined,
): () => void {
  const binding: IBinding = {
    attach,
    cancel: () => undefined,
    release: undefined,
    generation: undefined,
  };
  const standing = bindings.get(node) ?? new Set<IBinding>();
  standing.add(binding);
  bindings.set(node, standing);
  watched.add(node);
  registerPostCommit(rebindChangedFamilies);
  noteNodeBinding();
  binding.cancel = whenCommitted(node, () => attachBinding(node, binding));
  return () => unbind(node, binding);
}

export function releaseNodeBindings(node: ISymbioteNode): void {
  for (const binding of bindings.get(node) ?? []) unbind(node, binding);
}
