<script lang="ts">
  import ActionButton from '../components/ActionButton.svelte';
  import { ACCENT, LOGO_URI } from './canary-shared';

  let textLines = $state(1);
  function toggleTextLines(): void {
    textLines = textLines === 1 ? 3 : 1;
  }
</script>

<!-- Modern style props reaching Fabric's C++ parser, each an A/B on the dark theme -->
<view class="shadow-card" style={{ boxShadow: `0px 0px 22px 3px ${ACCENT}88` }}>
  <text class="note-text">boxShadow · flame glow</text>
</view>
<view class="row">
  <view class="filter-tile">
    <text class="tile-text">no filter</text>
  </view>
  <view class="filter-tile" style={{ filter: [{ brightness: 0.5 }] }}>
    <text class="tile-text">brightness 0.5</text>
  </view>
</view>
<view
  class="rotated-card"
  style={{ transformOrigin: 'top left', transform: [{ rotate: '4deg' }] }}
>
  <text class="tile-text">transformOrigin · top-left</text>
</view>
<!-- The gradient is authored in App.css and reaches Fabric through the css-parser -->
<view class="gradient-card">
  <text class="tile-text">background-image · linear-gradient</text>
</view>
<!-- PASS: the logo loads through the web alias fold and reads as "Svelte logo" -->
<image src={LOGO_URI} alt="Svelte logo" width={48} height={48} class="web-image" />
<!-- A prop updated after mount must reach the node, not only the children -->
<text class="section-label">Text · prop update after mount</text>
<text testID="text-lines-probe" class="list-row-text" numberOfLines={textLines}>
  Tapping the button below flips numberOfLines between 1 and 3. This sentence
  is deliberately long enough that the clamp is unmistakable at a glance,
  without needing to read it.
</text>
<ActionButton
  title="Toggle numberOfLines ({textLines})"
  color={ACCENT}
  onPress={toggleTextLines}
/>
