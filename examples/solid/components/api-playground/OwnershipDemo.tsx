// Reactive Primitives / Lifecycle — createRoot · getOwner · runWithOwner · onCleanup.
//
// Ownership is the half of Solid that has no React equivalent, and it is what makes a screen pop
// safe here: every computation belongs to the scope that created it, and popping the screen
// disposes that scope. The two buttons below are the two ways OUT of that, and only one of them
// is safe.
//
//   createRoot   — a DETACHED scope. It outlives this component, so its interval keeps running
//                  after the screen pops unless something disposes it. The onCleanup at the bottom
//                  is that something, and it is not optional.
//   runWithOwner — re-enters an owner captured earlier, so an onCleanup registered from inside an
//                  async callback still lands on THIS component. Without it the callback runs with
//                  no owner and the cleanup is simply never called.

import {
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  runWithOwner,
} from 'solid-js';
import { Text, View } from '@symbiote-native/solid';
import { ActionButton } from '../ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const ACCENT = LINE_COLOR.introspection;

export function OwnershipDemo() {
  const owner = getOwner();

  const [rootTicks, setRootTicks] = createSignal(0);
  const [ownedTicks, setOwnedTicks] = createSignal(0);
  const [adopted, setAdopted] = createSignal(false);

  let disposeRoot: (() => void) | undefined;

  const startDetachedRoot = (): void => {
    if (disposeRoot !== undefined) return;
    createRoot(dispose => {
      disposeRoot = dispose;
      const timer = setInterval(() => setRootTicks(value => value + 1), 400);
      onCleanup(() => clearInterval(timer));
    });
  };

  const stopDetachedRoot = (): void => {
    disposeRoot?.();
    disposeRoot = undefined;
  };

  // The detached root is not this component's child, so nothing disposes it for us.
  onCleanup(stopDetachedRoot);

  const adoptAsyncWork = (): void => {
    if (owner === null || adopted()) return;
    setTimeout(() => {
      runWithOwner(owner, () => {
        const timer = setInterval(() => setOwnedTicks(value => value + 1), 400);
        // Reachable only because of runWithOwner: onCleanup outside an owner is a no-op.
        onCleanup(() => clearInterval(timer));
        setAdopted(true);
      });
    }, 0);
  };

  return (
    <View class="section-nested">
      <Text class="section-label">
        createRoot · getOwner · runWithOwner · onCleanup
      </Text>
      <Text class="ap-value" testID="ownership-owner">
        {`getOwner() → ${owner === null ? 'null' : 'an owner'} · detached root ticks ${rootTicks()} · adopted interval ticks ${ownedTicks()}`}
      </Text>
      <View class="ap-wrap">
        <ActionButton
          testID="ownership-root-start"
          title="createRoot (detached)"
          color={ACCENT}
          onPress={startDetachedRoot}
        />
        <ActionButton
          testID="ownership-root-stop"
          title="dispose()"
          color={ACCENT}
          onPress={stopDetachedRoot}
        />
        <ActionButton
          testID="ownership-adopt"
          title="runWithOwner in setTimeout"
          color={ACCENT}
          onPress={adoptAsyncWork}
        />
      </View>
      <Text class="subtle">
        {adopted()
          ? 'the timeout ran under the captured owner — its onCleanup is now wired to this screen'
          : 'not adopted yet'}
      </Text>
    </View>
  );
}
