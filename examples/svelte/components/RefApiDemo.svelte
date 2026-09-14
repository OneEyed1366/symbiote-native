<script lang="ts">
  // Imperative host-ref API: the seam reanimated / gesture-handler reach through. `measure`
  // returns the box's real on-screen frame (only a live host can answer it); `setNativeProps`
  // recolors the box bypassing Svelte entirely (no state, no re-render); `findNodeHandle` reads
  // the committed native tag. Port of examples/react/components/RefApiDemo.tsx.
  //
  // `bind:this` on a host tag hands back a ShimElement, which `hostInstance()` unwraps into the
  // engine node carrying measure / setNativeProps (svelte-adapter-dom-shim skill, host-instance.ts
  // + host-instance.test.ts's tested pattern).
  import { findNodeHandle, hostInstance } from '@symbiote-native/svelte';
  import ActionButton from './ActionButton.svelte';

  let box = $state.raw<unknown>(null);
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

<view class="section-nested">
  <text class="section-label">
    Imperative ref · measure / setNativeProps / findNodeHandle
  </text>
  <view testID="ref-box" class="ref-box" bind:this={box}>
    <text class="ref-box-text">{`native tag ${tag ?? '—'}`}</text>
  </view>
  <text testID="measure-frame" class="info-text">{`frame: ${frame}`}</text>
  <view class="row">
    <view class="flex1">
      <ActionButton
        testID="measure-btn"
        title="Measure"
        onPress={onMeasure}
        color="#7fb5ff"
      />
    </view>
    <view class="flex1">
      <ActionButton
        title="Flash (setNativeProps)"
        onPress={onFlash}
        color="#f6ad55"
      />
    </view>
  </view>
</view>
