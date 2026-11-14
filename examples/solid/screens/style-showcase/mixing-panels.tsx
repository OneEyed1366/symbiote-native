import { createSignal, onCleanup, onMount } from 'solid-js';
import { Animated } from '@symbiote-native/solid';
import styles from '../StyleShowcase.module.css';
import { Toggle } from './parts';

const INLINE_FILL = { backgroundColor: '#7a1f2b' };
const PULSE_DURATION_MS = 1_600;
const PULSE_INPUT = [0, 0.5, 1];

function mergeReadoutFor(hasClass: boolean, hasInline: boolean): string {
  if (hasInline) return 'inline wins the fill';
  return hasClass ? 'class owns the fill' : 'no class, no inline';
}

export function MergePanel() {
  const [hasClass, setHasClass] = createSignal(true);
  const [hasInline, setHasInline] = createSignal(false);

  return (
    <view class="sc-panel">
      <text class="sc-panel-title">
        4 · A class and an inline style on one node
      </text>
      <text class="sc-panel-note">
        The engine keeps the two halves apart in a WeakMap and always writes
        them as [classStyle, explicitStyle] in that fixed order, so the
        explicit half wins whichever prop the framework happened to set last.
        Flip either half to see the other alone.
      </text>
      <view
        class={hasClass() ? 'sc-merge-tile' : ''}
        style={hasInline() ? INLINE_FILL : undefined}
        testID="sc-merge-tile"
      >
        <text class="sc-merge-text">
          {mergeReadoutFor(hasClass(), hasInline())}
        </text>
      </view>
      <text class="sc-tile-caption">
        The lime ring and the corners come from the class either way — the
        inline object names only backgroundColor, so it overrides only that.
      </text>
      <Toggle
        testID="sc-merge-class-toggle"
        label="class"
        active={hasClass()}
        onToggle={() => setHasClass(current => !current)}
      />
      <Toggle
        testID="sc-merge-inline-toggle"
        label="style={{ backgroundColor }}"
        active={hasInline()}
        onToggle={() => setHasInline(current => !current)}
      />
    </view>
  );
}

export function AnimationPanel() {
  // A plain const, not a hook, since a Solid component body runs once
  const pulse = new Animated.Value(0);

  // Native driver, so an always-on pulse costs no per-frame JS
  // The frames merge over the class style `routeProp` wrote, they never replace it
  onMount(() => {
    const animation = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: PULSE_DURATION_MS,
        useNativeDriver: true,
      }),
    );
    animation.start();
    onCleanup(() => animation.stop());
  });

  const pulseStyle = {
    opacity: pulse.interpolate({
      inputRange: PULSE_INPUT,
      outputRange: [1, 0.55, 1],
    }),
    transform: [
      {
        scale: pulse.interpolate({
          inputRange: PULSE_INPUT,
          outputRange: [1, 1.18, 1],
        }),
      },
    ],
  };

  return (
    <view class="sc-panel">
      <text class="sc-panel-title">5 · An animation on top of a class</text>
      <text class="sc-panel-note">
        The class owns the whole static look; the Animated.Value writes only
        transform and opacity. If a frame clobbered the resolved class the tile
        would lose its ring and its corners mid-pulse rather than merely stop
        moving — the two are independent, and the ring is the tell.
      </text>
      <view class="sc-anim-frame">
        <view class="sc-anim-tile" testID="sc-anim-tile" style={pulseStyle}>
          <text class="sc-anim-text">class + frame</text>
        </view>
      </view>
    </view>
  );
}

export function ModulesPanel() {
  return (
    <view class="sc-panel">
      <text class="sc-panel-title">6 · CSS Modules</text>
      <text class="sc-panel-note">
        Every class in StyleShowcase.module.css is renamed per file, so none of
        it can collide with App.css. The default export maps the AUTHORED name
        — kebab and all — to the renamed one, and css-dts generates the
        sibling .d.ts so a typo is a type error rather than the literal string
        "undefined" reaching the class prop.
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
        Two hops of composes. Each hop restates only background-color, so the
        three fills read left to right in the emitted token order —
        composed-first, which is what lets a composer override what it
        composes. The pill shape comes from the base and survives both.
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
        :global(.sc-global-mark) opts out of the rename, so it registers under
        its bare name and squares off two corners of the pill. We export it
        keyed as itself — upstream CSS Modules omits a global, which would
        force the author back to a bare string literal.
      </text>
      <text class="sc-readout" testID="sc-chip-readout">
        {styles['sc-chip-loud']}
      </text>
    </view>
  );
}

export function PreprocessorsPanel() {
  const [isOn, setIsOn] = createSignal(false);

  return (
    <view class="sc-panel">
      <text class="sc-panel-title">7 · SCSS · Less · Stylus</text>
      <text class="sc-panel-note">
        Each source reduces to plain CSS before the compiler sees it, so
        everything above applies identically regardless of language. Each tile
        leans on a variable, a parametric mixin, and arithmetic, so its padding
        is a number the source never spells — 26 / 22 / 18 px, from 13 / 11 / 9
        doubled.
      </text>
      <view class="sc-chip-row">
        <view
          class={`scss-tile${isOn() ? ' scss-tile-on' : ''}`}
          testID="sc-scss-tile"
        >
          <text class="scss-tile-text">SCSS</text>
        </view>
        <view
          class={`less-tile${isOn() ? ' less-tile-on' : ''}`}
          testID="sc-less-tile"
        >
          <text class="less-tile-text">Less</text>
        </view>
        <view
          class={`styl-tile${isOn() ? ' styl-tile-on' : ''}`}
          testID="sc-styl-tile"
        >
          <text class="styl-tile-text">Stylus</text>
        </view>
      </view>
      <text class="sc-tile-caption">
        Three different corner radii (14 / 18 / 22) from three mixin calls. The
        toggle turns on each file's `&.x-tile-on` nest, which compiles to a
        COMPOUND selector — nesting that produced a descendant would hit the
        limit two panels down.
      </text>
      <Toggle
        testID="sc-preprocessor-toggle"
        label="nested &.on rule"
        active={isOn()}
        onToggle={() => setIsOn(current => !current)}
      />
    </view>
  );
}
