<script lang="ts">
  import styles from '../StyleShowcase.module.css';
</script>

<view class="sc-panel">
  <text class="sc-panel-title">6 · CSS Modules</text>
  <text class="sc-panel-note">
    Every class in StyleShowcase.module.css is renamed per file, so none of it
    can collide with App.css. The default export maps the AUTHORED name — kebab
    and all — to the renamed one, and css-dts generates the sibling .d.ts so a
    typo is a type error rather than the literal string "undefined" reaching the
    class prop.
  </text>
  <view class="sc-chip-row">
    <view class={styles['sc-chip-base']} testID="sc-chip-base">
      <text class={styles['sc-chip-text']}>base</text>
    </view>
    <view class={styles['sc-chip-tinted']} testID="sc-chip-tinted">
      <text class={styles['sc-chip-text']}>composes base</text>
    </view>
    <view class={styles['sc-chip-loud']} testID="sc-chip-loud">
      <text class={styles['sc-chip-text']}>composes tinted</text>
    </view>
  </view>
  <text class="sc-tile-caption">
    Two hops of composes. Each hop restates only background-color, so the three
    fills read left to right in the emitted token order — composed-first, which
    is what lets a composer override what it composes. The pill shape comes from
    the base and survives both.
  </text>
  <view class="sc-chip-row">
    <view
      class={`${styles['sc-chip-loud']} ${styles['sc-global-mark']}`}
      testID="sc-chip-global"
    >
      <text class={styles['sc-chip-text']}>+ :global mark</text>
    </view>
  </view>
  <text class="sc-tile-caption">
    :global(.sc-global-mark) opts out of the rename, so it registers under its
    bare name and squares off two corners of the pill. We export it keyed as
    itself — upstream CSS Modules omits a global, which would force the author
    back to a bare string literal.
  </text>
  <text class="sc-readout" testID="sc-chip-readout">
    {styles['sc-chip-loud']}
  </text>
</view>
