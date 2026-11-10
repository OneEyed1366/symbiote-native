<script lang="ts">
  import StyleShowcaseToggle from '../../components/StyleShowcaseToggle.svelte';
  import { classList } from './class-list';

  let isStrong = $state(false);
  let hasOrderPair = $state(false);

  const specClass = $derived(
    classList('sc-spec-tile', {
      'sc-spec-strong': isStrong,
      'sc-spec-early': hasOrderPair,
      'sc-spec-late': hasOrderPair,
    }),
  );
</script>

<view class="sc-panel">
  <text class="sc-panel-title">
    2 · Specificity beats position; position breaks a tie
  </text>
  <text class="sc-panel-note">
    The file order is adversarial on purpose. `.sc-spec-tile.sc-spec-strong` is
    declared ABOVE the plain `.sc-spec-tile` and still wins the fill, because
    (0,2,0) outranks (0,1,0). `.sc-spec-early` and `.sc-spec-late` are equally
    specific, so the border goes to whichever is later in the file.
  </text>
  <view class={specClass} testID="sc-spec-tile">
    <text class="sc-spec-text">
      {isStrong ? 'green fill · compound rule won' : 'slate fill · base rule'}
    </text>
  </view>
  <text class="sc-readout" testID="sc-spec-readout">{specClass}</text>
  <text class="sc-tile-caption">
    {hasOrderPair
      ? 'border is sky blue — .sc-spec-late is the later line of the equal-specificity pair'
      : 'border is slate — neither of the equal-specificity pair is on the node'}
  </text>
  <StyleShowcaseToggle
    testID="sc-spec-strong-toggle"
    label=".sc-spec-strong"
    active={isStrong}
    onToggle={() => (isStrong = !isStrong)}
  />
  <StyleShowcaseToggle
    testID="sc-spec-order-toggle"
    label=".sc-spec-early + .sc-spec-late"
    active={hasOrderPair}
    onToggle={() => (hasOrderPair = !hasOrderPair)}
  />
</view>
