<script lang="ts">
  // PlatformColor / DynamicColorIOS resolve on the native side: 'systemBlue' / 'label'
  // become iOS UIColor selectors, and the dynamic tuple flips with the system
  // appearance. The opaque color objects flow through the same color seam as CSS
  // strings (processColor), so no special handling reaches Fabric. Name resolution is
  // device-only: a wrong name silently falls back, so this is verified on simulator.
  import {
    PlatformColor,
    DynamicColorIOS,
    useColorScheme,
  } from '@symbiote-native/svelte';

  // useColorScheme returns a boxed getter (Svelte 5's reactivity doesn't survive a bare
  // $state value returned from a plain function) — call once, read `.current` below.
  const scheme = useColorScheme();
</script>

<view class="section-nested">
  <text class="section-label">
    {`PlatformColor · semantic + DynamicColorIOS (${scheme.current ?? 'unknown'})`}
  </text>
  <view class="row">
    <view
      class="color-tile"
      style={{ backgroundColor: PlatformColor('systemBlue') }}
    >
      <text class="tile-label">systemBlue</text>
    </view>
    <view
      class="color-tile-bordered"
      style={{
        backgroundColor: DynamicColorIOS({ light: '#dbeafe', dark: '#13243a' }),
        borderColor: PlatformColor('separator'),
      }}
    >
      <text class="bold-label" style={{ color: PlatformColor('label') }}>
        dynamic
      </text>
    </view>
  </view>
</view>
