<script lang="ts">
  // Runes section of the API Playground (.docs/framework-api-surface/svelte.md). Covers every
  // Yes/Partial row except $bindable/$props()/$props.id() (NumberStepper.svelte owns those — see
  // ApiPlaygroundScreen.svelte's composition) and $host() (No — needs the `customElement`
  // compiler option and a real HTMLElement dispatch target, neither of which exists here).
  import { Text, View } from '@symbiote-native/svelte';
  import { dlog } from '@symbiote-native/engine';
  import ActionButton from '../ActionButton.svelte';

  const ACCENT = '#ff3e00';

  // $state / $derived / $derived.by
  let count = $state(0);
  const doubled = $derived(count * 2);
  const parity = $derived.by(() => (count % 2 === 0 ? 'even' : 'odd'));

  // $state.raw: only a REASSIGNMENT is reactive, a mutation of the object in place is not — the
  // same identity-preserving discipline Switch/Pressable hold their engine node in (svelte-
  // adapter-dom-shim skill §15). `mutateRaw` intentionally does nothing visible.
  let rawBox = $state.raw({ n: 0 });
  function mutateRaw(): void {
    rawBox.n += 1;
  }
  function reassignRaw(): void {
    rawBox = { n: rawBox.n + 1 };
  }

  // $state.snapshot
  let snapshotText = $state<string | undefined>(undefined);
  function takeSnapshot(): void {
    const snapshot = $state.snapshot(rawBox);
    dlog(`api-playground: $state.snapshot -> ${JSON.stringify(snapshot)}`);
    snapshotText = JSON.stringify(snapshot);
  }

  // $effect — dependency is `count`; the run counter is a plain closure variable so the effect
  // never reads its own output (reading AND writing the same $state inside one effect is the
  // self-dependency trap this sidesteps).
  let effectRunsRaw = 0;
  let effectRuns = $state(0);
  $effect(() => {
    count;
    effectRunsRaw += 1;
    effectRuns = effectRunsRaw;
  });

  // $effect.pre — Partial: runs, but there is no synchronous pre-commit layout value to read the
  // way a web `clientHeight` would be (Fabric's clone-on-write commit is async).
  let preEffectLog = $state('not run yet');
  $effect.pre(() => {
    preEffectLog = `ran before this update committed (count=${count})`;
  });

  // $effect.root — a manually-destroyed effect scope, outside the normal component-lifecycle
  // cleanup.
  let rootEffectStatus = $state('not started');
  let destroyRoot: (() => void) | undefined;
  function startRootEffect(): void {
    if (destroyRoot !== undefined) return;
    destroyRoot = $effect.root(() => {
      $effect(() => {
        rootEffectStatus = `running (count=${count})`;
      });
      return () => {
        rootEffectStatus = 'destroyed';
      };
    });
  }
  function stopRootEffect(): void {
    destroyRoot?.();
    destroyRoot = undefined;
  }

  // $effect.tracking() — false at top-level script (component init, no tracking context), true
  // inside a $derived/$effect body.
  const trackedAtInit = $effect.tracking();
  const trackedInsideDerived = $derived.by(() => $effect.tracking());

  // $inspect / $inspect.with / $inspect.trace — dev-time only, no-op in production builds.
  // `$inspect(count)` alone logs via Svelte's own console.log on every change (check the Metro
  // console); `.with(fn)` lets us route that same signal through our own dlog instead.
  let inspectWithLog = $state('not run yet');
  $inspect(count).with((type, value) => {
    dlog(`api-playground: $inspect.with type=${type} value=${value}`);
    inspectWithLog = `$inspect.with last saw type=${type} value=${value}`;
  });
  const tracedDouble = $derived.by(() => {
    $inspect.trace('tracedDouble');
    return count * 2;
  });
</script>

<View class="section-nested">
  <Text class="section-label">Runes · $state, $derived, $effect family</Text>
  <View class="row-align-center">
    <ActionButton
      testID="runes-decrement"
      title="−"
      color={ACCENT}
      onPress={() => (count -= 1)}
    />
    <Text class="info-text-flex" testID="runes-count">
      {`count: ${count} · $derived doubled: ${doubled} · $derived.by parity: ${parity}`}
    </Text>
    <ActionButton
      testID="runes-increment"
      title="+"
      color={ACCENT}
      onPress={() => (count += 1)}
    />
  </View>
  <Text class="note-text" testID="runes-effect-readout">
    {`$effect ran ${effectRuns} time(s) so far (tracks count) · $effect.pre: ${preEffectLog}`}
  </Text>
  <Text class="note-text">
    Partial — $effect.pre runs mechanically, but has no synchronous pre-commit
    layout value to read here.
  </Text>
  <Text class="note-text" testID="runes-tracking-readout">
    {`$effect.tracking() at component init: ${trackedAtInit} · inside a $derived.by: ${trackedInsideDerived}`}
  </Text>
  <View class="row-align-center">
    <ActionButton
      testID="runes-mutate-raw"
      title="Mutate $state.raw (no re-render)"
      color={ACCENT}
      onPress={mutateRaw}
    />
    <ActionButton
      testID="runes-reassign-raw"
      title="Reassign $state.raw"
      color={ACCENT}
      onPress={reassignRaw}
    />
  </View>
  <Text class="info-text" testID="runes-raw-readout">
    {`$state.raw n (updates only on reassignment): ${rawBox.n}`}
  </Text>
  <ActionButton
    testID="runes-snapshot"
    title="$state.snapshot(rawBox)"
    color={ACCENT}
    onPress={takeSnapshot}
  />
  <Text class="info-text" testID="runes-snapshot-readout">
    {snapshotText === undefined
      ? 'tap to capture a plain deep copy of $state.raw'
      : `snapshot: ${snapshotText}`}
  </Text>
  <View class="row-align-center">
    <ActionButton
      testID="runes-root-start"
      title="Start $effect.root"
      color={ACCENT}
      onPress={startRootEffect}
    />
    <ActionButton
      testID="runes-root-stop"
      title="Destroy root"
      color={ACCENT}
      onPress={stopRootEffect}
    />
  </View>
  <Text class="info-text" testID="runes-root-readout">
    {`$effect.root status: ${rootEffectStatus}`}
  </Text>
  <Text class="note-text" testID="runes-inspect-readout">
    {`$inspect.with: ${inspectWithLog} · $inspect.trace'd derived value: ${tracedDouble} (see Metro console for both plus plain $inspect(count))`}
  </Text>
</View>
