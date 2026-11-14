<script lang="ts">
  import type { ISymbioteEvent } from '@symbiote-native/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import { LINE_COLOR } from '../../navigation-lines';

  const NARROW_WIDTH = 200;
  const WIDE_WIDTH = 320;
  const NOT_LAID_OUT = '-';

  let width = $state(NARROW_WIDTH);
  let laidOut = $state(NOT_LAID_OUT);
  const isWide = $derived(width === WIDE_WIDTH);

  // `nativeEvent` is a bag, so the width is narrowed out of it rather than cast
  function layoutWidth(event: ISymbioteEvent): number | undefined {
    const layout = event.nativeEvent.layout;
    if (typeof layout !== 'object' || layout === null) return undefined;
    if (!('width' in layout)) return undefined;
    return typeof layout.width === 'number' ? layout.width : undefined;
  }

  function onLayout(event: ISymbioteEvent) {
    const measured = layoutWidth(event);
    if (measured !== undefined) laidOut = String(Math.round(measured));
  }

  function onToggle() {
    width = isWide ? NARROW_WIDTH : WIDE_WIDTH;
  }
</script>

<view class="sc-panel">
  <text class="sc-panel-title">11 · Device lab: @container</text>
  <text class="sc-tile-label">A BOX THE BUTTON WIDENS PAST 240</text>
  <view
    class="lab-container"
    testID="lab-container"
    style={{ width }}
    {onLayout}
  >
    <view class="lab-consumer-swatch" />
    <text class="lab-nested-outer">
      <text class="lab-nested-inner">Aa</text>
    </text>
  </view>
  <text class="lab-readout" testID="lab-container-readout">
    {`container=${width} laid-out=${laidOut}`}
  </text>
  <ActionButton
    testID="lab-container-toggle"
    title={isWide ? 'Narrow the container' : 'Widen the container'}
    color={LINE_COLOR.styling}
    onPress={onToggle}
  />
  <text class="sc-tile-label">WIDE FROM THE FIRST FRAME</text>
  <view class="lab-container-first" testID="lab-container-first">
    <view class="lab-first-swatch" />
    <text class="lab-nested-outer">
      <text class="lab-first-nested-inner">Aa</text>
    </text>
  </view>
  <text class="sc-tile-caption">
    Both the swatch and the glyphs of the nested text change colour once the
    container is 240 wide or more. The laid-out width is what the device
    reported, not what the style asked for.
  </text>
  <text class="sc-tile-label">ONE AXIS, AND THE BOX ITSELF</text>
  <view class="lab-axis-box" testID="lab-axis-box">
    <view class="lab-axis-width" />
    <view class="lab-axis-height" />
  </view>
  <text class="sc-tile-caption">
    Only the width query holds in an inline-size container: the first swatch
    changes colour, the second stays put. The box carries a query of its own and
    keeps its colour, since a container never styles itself.
  </text>
</view>
