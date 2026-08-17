<script lang="ts">
  // Imperative host-ref API: the seam reanimated / gesture-handler reach through. `measure`
  // returns the box's real on-screen frame (only a live host can answer it); `setNativeProps`
  // recolors the box bypassing Svelte entirely (no state, no re-render); `findNodeHandle` reads
  // the committed native tag. Port of examples/react/components/RefApiDemo.tsx.
  //
  // The measured box binds directly to the raw `symbiote-view` host tag, not the public `View`
  // wrapper — View.svelte forwards no `bind:this` escape hatch of its own (see
  // pressable/index.svelte's and AnimatedView.svelte's header comments), so only a hand-authored
  // host tag hands back a real ShimElement `hostInstance()` can unwrap into measure/setNativeProps
  // (svelte-adapter-dom-shim skill, host-instance.ts + host-instance.test.ts's tested pattern).
  //
  // The 4-way sibling group below (label / ref box / frame text / button row) is packed with zero
  // whitespace between tags: Svelte keeps whitespace strictly BETWEEN sibling nodes as a real text
  // node, which would land as an invalid RCTRawText child of a non-Text host
  // (svelte-adapter-dom-shim skill §16 — a real bug already found this way in shipped code).
  import {
    View,
    Text,
    findNodeHandle,
    hostInstance,
    type ShimElement,
  } from '@symbiote-native/svelte';
  import ActionButton from './ActionButton.svelte';

  let box = $state.raw<ShimElement | null>(null);
  // useRef-equivalent: an imperative-only scratch flag, never meant to drive a re-render itself.
  let flashed = false;
  let frame = $state('tap “Measure”');
  let tag = $state<number | null>(null);

  // The tag exists only after the first commit, so read it once `box` goes live.
  $effect(() => {
    if (box === null) return;
    tag = findNodeHandle(box);
  });

  function onMeasure(): void {
    const instance = hostInstance(box);
    if (instance === undefined) return;
    instance.measure((x, y, width, height, pageX, pageY) => {
      frame =
        `x${Math.round(x)} y${Math.round(y)} · ${Math.round(width)}×${Math.round(height)}` +
        ` · page ${Math.round(pageX)},${Math.round(pageY)}`;
    });
  }

  function onFlash(): void {
    const instance = hostInstance(box);
    if (instance === undefined) return;
    flashed = !flashed;
    instance.setNativeProps({
      style: { backgroundColor: flashed ? '#f6ad55' : '#7fb5ff' },
    });
  }
</script>

<View class="section-nested"
  ><Text class="section-label"
    >Imperative ref · measure / setNativeProps / findNodeHandle</Text
  ><symbiote-view p={{ testID: 'ref-box', class: 'ref-box' }} bind:this={box}
    ><Text class="ref-box-text">{`native tag ${tag ?? '—'}`}</Text
    ></symbiote-view
  ><Text testID="measure-frame" class="info-text">{`frame: ${frame}`}</Text
  ><View class="row"
    ><View class="flex1"
      ><ActionButton
        testID="measure-btn"
        title="Measure"
        onPress={onMeasure}
        color="#7fb5ff"
      /></View
    ><View class="flex1"
      ><ActionButton
        title="Flash (setNativeProps)"
        onPress={onFlash}
        color="#f6ad55"
      /></View
    ></View
  ></View
>
