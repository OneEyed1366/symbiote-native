<script lang="ts">
  import StyleShowcaseToggle from '../../components/StyleShowcaseToggle.svelte';

  const INLINE_FILL = { backgroundColor: '#7a1f2b' };

  let hasClass = $state(true);
  let hasInline = $state(false);

  function mergeReadoutFor(isClassOn: boolean, isInlineOn: boolean): string {
    if (isInlineOn) return 'inline wins the fill';
    return isClassOn ? 'class owns the fill' : 'no class, no inline';
  }
</script>

<view class="sc-panel">
  <text class="sc-panel-title">
    4 · A class and an inline style on one node
  </text>
  <text class="sc-panel-note">
    The engine keeps the two halves apart in a WeakMap and always writes them as
    [classStyle, explicitStyle] in that fixed order, so the explicit half wins
    whichever prop the framework happened to set last. Flip either half to see
    the other alone.
  </text>
  <view
    class={hasClass ? 'sc-merge-tile' : ''}
    style={hasInline ? INLINE_FILL : undefined}
    testID="sc-merge-tile"
  >
    <text class="sc-merge-text">{mergeReadoutFor(hasClass, hasInline)}</text>
  </view>
  <text class="sc-tile-caption">
    The lime ring and the corners come from the class either way — the inline
    object names only backgroundColor, so it overrides only that.
  </text>
  <StyleShowcaseToggle
    testID="sc-merge-class-toggle"
    label="class"
    active={hasClass}
    onToggle={() => (hasClass = !hasClass)}
  />
  <StyleShowcaseToggle
    testID="sc-merge-inline-toggle"
    label={'style={{ backgroundColor }}'}
    active={hasInline}
    onToggle={() => (hasInline = !hasInline)}
  />
</view>
