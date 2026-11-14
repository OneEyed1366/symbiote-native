import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import {
  Animated,
  AnimatedView,
  SYMBIOTE_ELEMENTS,
} from '@symbiote-native/angular';
import styles from '../StyleShowcase.module.css';
import { ShowcaseToggle } from './parts';

// Frozen, since `[style]` reaches a primitive host as an ordinary @Input
const MERGE_INLINE_STYLE = { backgroundColor: '#7a1f2b' } as const;
const PULSE_DURATION_MS = 1_600;
const PULSE_INPUT = [0, 0.5, 1];

function mergeReadoutFor(hasClass: boolean, hasInline: boolean): string {
  if (hasInline) return 'inline wins the fill';
  return hasClass ? 'class owns the fill' : 'no class, no inline';
}

@Component({
  selector: 'ShowcaseMergePanel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ShowcaseToggle, SYMBIOTE_ELEMENTS],
  template: `
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
        [class]="mergeClass()"
        [style]="mergeStyle()"
        testID="sc-merge-tile"
      >
        <text class="sc-merge-text">{{ mergeReadout() }}</text>
      </view>
      <text class="sc-tile-caption">
        The lime ring and the corners come from the class either way — the
        inline object names only backgroundColor, so it overrides only that.
      </text>
      <ShowcaseToggle
        testID="sc-merge-class-toggle"
        label="class"
        [active]="hasMergeClass()"
        (toggle)="hasMergeClass.set(!hasMergeClass())"
      ></ShowcaseToggle>
      <ShowcaseToggle
        testID="sc-merge-inline-toggle"
        [label]="mergeInlineLabel"
        [active]="hasMergeInline()"
        (toggle)="hasMergeInline.set(!hasMergeInline())"
      ></ShowcaseToggle>
    </view>
  `,
})
export class ShowcaseMergePanel {
  // Bound, since a template binding spelled out verbatim does not survive as an attribute value
  readonly mergeInlineLabel = '[style]="{ backgroundColor }"';

  readonly hasMergeClass = signal(true);
  readonly hasMergeInline = signal(false);

  readonly mergeClass = computed(() =>
    this.hasMergeClass() ? 'sc-merge-tile' : '',
  );

  readonly mergeStyle = computed(() =>
    this.hasMergeInline() ? MERGE_INLINE_STYLE : undefined,
  );

  readonly mergeReadout = computed(() =>
    mergeReadoutFor(this.hasMergeClass(), this.hasMergeInline()),
  );
}

@Component({
  selector: 'ShowcaseAnimationPanel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnimatedView, SYMBIOTE_ELEMENTS],
  template: `
    <view class="sc-panel">
      <text class="sc-panel-title">5 · An animation on top of a class</text>
      <text class="sc-panel-note">
        The class owns the whole static look; the Animated.Value writes only
        transform and opacity. If a frame clobbered the resolved class the tile
        would lose its ring and its corners mid-pulse rather than merely stop
        moving — the two are independent, and the ring is the tell.
      </text>
      <view class="sc-anim-frame">
        <AnimatedView
          class="sc-anim-tile"
          testID="sc-anim-tile"
          [style]="pulseStyle"
        >
          <text class="sc-anim-text">class + frame</text>
        </AnimatedView>
      </view>
    </view>
  `,
})
export class ShowcaseAnimationPanel implements OnInit, OnDestroy {
  private readonly pulse = new Animated.Value(0);
  private animation: ReturnType<typeof Animated.loop> | undefined;

  // Frozen, since a fresh literal every pass would churn the prop bag
  readonly pulseStyle = {
    opacity: this.pulse.interpolate({
      inputRange: PULSE_INPUT,
      outputRange: [1, 0.55, 1],
    }),
    transform: [
      {
        scale: this.pulse.interpolate({
          inputRange: PULSE_INPUT,
          outputRange: [1, 1.18, 1],
        }),
      },
    ],
  };

  // Native driver, so an always-on pulse costs no per-frame JS
  ngOnInit(): void {
    this.animation = Animated.loop(
      Animated.timing(this.pulse, {
        toValue: 1,
        duration: PULSE_DURATION_MS,
        useNativeDriver: true,
      }),
    );
    this.animation.start();
  }

  ngOnDestroy(): void {
    this.animation?.stop();
  }
}

@Component({
  selector: 'ShowcaseModulesPanel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
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
        <view [class]="chipBaseClass" testID="sc-chip-base">
          <text [class]="chipTextClass">base</text>
        </view>
        <view [class]="chipTintedClass" testID="sc-chip-tinted">
          <text [class]="chipTextClass">composes base</text>
        </view>
        <view [class]="chipLoudClass" testID="sc-chip-loud">
          <text [class]="chipTextClass">composes tinted</text>
        </view>
      </view>
      <text class="sc-tile-caption">
        Two hops of composes. Each hop restates only background-color, so the
        three fills read left to right in the emitted token order —
        composed-first, which is what lets a composer override what it
        composes. The pill shape comes from the base and survives both.
      </text>
      <view class="sc-chip-row">
        <view [class]="chipGlobalClass" testID="sc-chip-global">
          <text [class]="chipTextClass">+ :global mark</text>
        </view>
      </view>
      <text class="sc-tile-caption">
        :global(.sc-global-mark) opts out of the rename, so it registers under
        its bare name and squares off two corners of the pill. We export it
        keyed as itself — upstream CSS Modules omits a global, which would
        force the author back to a bare string literal.
      </text>
      <text class="sc-readout" testID="sc-chip-readout">
        {{ chipLoudClass }}
      </text>
    </view>
  `,
})
export class ShowcaseModulesPanel {
  // Named fields, so a typo becomes a TS2339 instead of the string "undefined" reaching `class`
  readonly chipBaseClass = styles['sc-chip-base'];
  readonly chipTintedClass = styles['sc-chip-tinted'];
  readonly chipLoudClass = styles['sc-chip-loud'];
  readonly chipTextClass = styles['sc-chip-text'];
  readonly chipGlobalClass = `${styles['sc-chip-loud']} ${styles['sc-global-mark']}`;
}

@Component({
  selector: 'ShowcasePreprocessorsPanel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ShowcaseToggle, SYMBIOTE_ELEMENTS],
  template: `
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
        <view [class]="scssTileClass()" testID="sc-scss-tile">
          <text class="scss-tile-text">SCSS</text>
        </view>
        <view [class]="lessTileClass()" testID="sc-less-tile">
          <text class="less-tile-text">Less</text>
        </view>
        <view [class]="stylTileClass()" testID="sc-styl-tile">
          <text class="styl-tile-text">Stylus</text>
        </view>
      </view>
      <text class="sc-tile-caption">
        Three different corner radii (14 / 18 / 22) from three mixin calls. The
        toggle turns on each file's \`&.x-tile-on\` nest, which compiles to a
        COMPOUND selector — nesting that produced a descendant would hit the
        limit two panels down.
      </text>
      <ShowcaseToggle
        testID="sc-preprocessor-toggle"
        label="nested &.on rule"
        [active]="arePreprocessorsOn()"
        (toggle)="arePreprocessorsOn.set(!arePreprocessorsOn())"
      ></ShowcaseToggle>
    </view>
  `,
})
export class ShowcasePreprocessorsPanel {
  readonly arePreprocessorsOn = signal(false);

  readonly scssTileClass = computed(
    () => `scss-tile${this.arePreprocessorsOn() ? ' scss-tile-on' : ''}`,
  );

  readonly lessTileClass = computed(
    () => `less-tile${this.arePreprocessorsOn() ? ' less-tile-on' : ''}`,
  );

  readonly stylTileClass = computed(
    () => `styl-tile${this.arePreprocessorsOn() ? ' styl-tile-on' : ''}`,
  );
}
