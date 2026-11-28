<script lang="ts">
  // Runes section of the API Playground, covering every Yes and Partial row
  // `$bindable`, `$props` and `$props.id` live in `NumberStepper.svelte`
  // `$host` is No, as it needs the `customElement` option and a real HTMLElement target
  import { dlog } from '@symbiote-native/engine';
  import ActionButton from '../ActionButton.svelte';

  const ACCENT = '#ff3e00';

  // $state / $derived / $derived.by
  let count = $state(0);
  const doubled = $derived(count * 2);
  const parity = $derived.by(() => (count % 2 === 0 ? 'even' : 'odd'));

  // `$state.raw` reacts to a reassignment only, not to an in-place mutation
  // `mutateRaw` shows nothing on purpose
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

  // `$effect` depends on `count`, and the run counter is a plain closure variable
  // So the effect never reads its own output, which would make it depend on itself
  let effectRunsRaw = 0;
  let effectRuns = $state(0);
  $effect(() => {
    dlog(`api-playground: $effect saw count=${count}`);
    effectRunsRaw += 1;
    effectRuns = effectRunsRaw;
  });

  // `$effect.pre` is Partial: it runs, but Fabric's clone-on-write commit is async
  // So there is no synchronous pre-commit layout value like a web `clientHeight`
  // eslint-disable-next-line svelte/prefer-writable-derived -- this is the $effect.pre demo itself
  let preEffectLog = $state('not run yet');
  $effect.pre(() => {
    preEffectLog = `ran before this update committed (count=${count})`;
  });

  // `$effect.root` is a manually destroyed effect scope outside the component lifecycle
  // eslint-disable-next-line svelte/prefer-writable-derived -- this is the $effect.root demo itself
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

  // `$effect.tracking()` is false at the script top level and true inside a derived or effect
  const trackedAtInit = $effect.tracking();
  const trackedInsideDerived = $derived.by(() => $effect.tracking());

  // `$inspect`, `.with` and `.trace` are dev-time only and no-ops in production builds
  // `$inspect(count)` alone logs to the console on each change, and `.with(fn)` routes it to `dlog`
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

<view class="section-nested">
  <text class="section-label">Runes · $state, $derived, $effect family</text>
  <view class="row-align-center">
    <ActionButton
      testID="runes-decrement"
      title="−"
      color={ACCENT}
      onPress={() => (count -= 1)}
    />
    <text class="info-text-flex" testID="runes-count">
      {`count: ${count} · $derived doubled: ${doubled} · $derived.by parity: ${parity}`}
    </text>
    <ActionButton
      testID="runes-increment"
      title="+"
      color={ACCENT}
      onPress={() => (count += 1)}
    />
  </view>
  <text class="note-text" testID="runes-effect-readout">
    {`$effect ran ${effectRuns} time(s) so far (tracks count) · $effect.pre: ${preEffectLog}`}
  </text>
  <text class="note-text">
    Partial — $effect.pre runs mechanically, but has no synchronous pre-commit
    layout value to read here.
  </text>
  <text class="note-text" testID="runes-tracking-readout">
    {`$effect.tracking() at component init: ${trackedAtInit} · inside a $derived.by: ${trackedInsideDerived}`}
  </text>
  <view class="row-align-center">
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
  </view>
  <text class="info-text" testID="runes-raw-readout">
    {`$state.raw n (updates only on reassignment): ${rawBox.n}`}
  </text>
  <ActionButton
    testID="runes-snapshot"
    title="$state.snapshot(rawBox)"
    color={ACCENT}
    onPress={takeSnapshot}
  />
  <text class="info-text" testID="runes-snapshot-readout">
    {snapshotText === undefined
      ? 'tap to capture a plain deep copy of $state.raw'
      : `snapshot: ${snapshotText}`}
  </text>
  <view class="row-align-center">
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
  </view>
  <text class="info-text" testID="runes-root-readout">
    {`$effect.root status: ${rootEffectStatus}`}
  </text>
  <text class="note-text" testID="runes-inspect-readout">
    {`$inspect.with: ${inspectWithLog} · $inspect.trace'd derived value: ${tracedDouble} (see Metro console for both plus plain $inspect(count))`}
  </text>
</view>
