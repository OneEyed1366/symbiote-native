<script lang="ts">
  // Imperative host-ref API, the seam reanimated and gesture-handler reach through
  // `{@attach}` hands over the element and `hostInstance()` unwraps the node with `measure`
  // The React twin is examples/react/components/RefApiDemo.tsx
  import { findNodeHandle, hostInstance } from '@symbiote-native/svelte';
  import ActionButton from './ActionButton.svelte';

  let box = $state.raw<unknown>(null);
  // Plain flag like a `useRef`, as it must never drive a re-render
  let flashed = false;
  let frame = $state('tap “Measure”');
  let tag = $state<number | null>(null);

  // The tag exists only after the first commit, so read it once `box` goes live
  $effect(() => {
    if (box === null) return;
    tag = findNodeHandle(box);
  });

  function onMeasure(): void {
    const instance = hostInstance(box);
    if (instance === undefined) return;
    // `x` and `y` are the offset inside the parent, so scrolling leaves them alone
    // `pageX` and `pageY` are measured from the root, so they move with it
    instance.measure((...measured) => {
      const [x, y, width, height, pageX, pageY] = measured;
      frame =
        `in parent x${Math.round(x)} y${Math.round(y)} · ${Math.round(width)}×${Math.round(height)}` +
        ` · from root ${Math.round(pageX)},${Math.round(pageY)}`;
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
  <view
    testID="ref-box"
    class="ref-box"
    {@attach (node: unknown) => {
      box = node;
    }}
  >
    <text class="ref-box-text">{`native tag ${tag ?? '—'}`}</text>
  </view>
  <text testID="measure-frame" class="info-text">{`measure · ${frame}`}</text>
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
