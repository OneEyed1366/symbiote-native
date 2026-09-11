<script lang="ts">
  // The whole surface of @symbiote-native/css-parser on one screen — what it does, and what it
  // deliberately does not.
  //
  // This is a showcase, not a conformance harness, but it is built so that a regression PAINTS.
  // Every tile is a pair or a shape whose failure mode is visible from across the room: the
  // corner-radius tile goes square, the filtered tile becomes its own twin, the limits tiles turn
  // red. That bias exists because `border-top-left-radius` shipped silently dropped and survived
  // until somebody happened to look at a corner on a device — a screen where a dropped rule is
  // invisible would not have caught it either.
  //
  // Six sheets, one per mechanism, so the pipeline is legible from the file tree alone:
  //   StyleShowcase.css          plain global sheet
  //   StyleShowcase.module.css   CSS Modules — composes chain, :global(), authored keys
  //   showcase.scss/.less/.styl  the three preprocessors
  //   StyleShowcase.limits.css   the deliberately-unsupported section
  //
  // They are standalone FILES rather than this component's own <style> block on purpose: a Svelte
  // style block is scoped per file, and the point of the screen is the app-wide, cross-file
  // pipeline. components/CompoundClassDemo.svelte is where the scoped-block path is exercised.
  //
  // Every dynamic tile works by changing the SET OF CLASSES ON THE NODE ITSELF. That is not a
  // workaround for the lack of a runtime cascade — `var()` is substituted at build time and a
  // combinator does not descend, so the class set is where all the interesting behaviour lives.
  //
  // Whitespace in this markup is free. The shim maps a whitespace-only text node under a parent
  // that takes no raw text to an anchor, so a gap between siblings never reaches Fabric as an
  // RCTRawText (svelte-adapter-dom-shim §16b), and svelte.config.js's collapseTextWhitespace()
  // folds a sentence wrapped across source lines.
  import { Animated } from '@symbiote-native/svelte';
  import StyleShowcaseTile from '../components/StyleShowcaseTile.svelte';
  import StyleShowcaseToggle from '../components/StyleShowcaseToggle.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
  import styles from './StyleShowcase.module.css';
  import './StyleShowcase.css';
  import './StyleShowcase.limits.css';
  import './showcase.scss';
  import './showcase.less';
  import './showcase.styl';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StyleShowcase];

  let isStrong = $state(false);
  let hasOrderPair = $state(false);
  let tokenA = $state(false);
  let tokenB = $state(false);
  let tokenC = $state(false);
  let hasMergeClass = $state(true);
  let hasMergeInline = $state(false);
  let preprocessorsOn = $state(false);

  // A top-level script const runs once per component instance — Svelte needs no useRef trick to
  // keep the value across updates.
  const pulse = new Animated.Value(0);

  // A single looping timing on the native driver: the curve lives in NativeAnimated, so an
  // always-on pulse costs no per-frame JS on a screen the user may leave open. The class-derived
  // style is written once at mount and the frames never touch it.
  //
  // The JS driver would survive too, for a reason worth knowing rather than assuming: its
  // per-frame setNativeProps MERGES onto flattenStyle(node.props.style), and that value is the
  // [classStyle, explicitStyle] array routeProp wrote — so the class is inside what the frame
  // merges over, not something it replaces (core/engine/src/commit.ts's setNativeProps).
  //
  // No reactive dependency is read here, so this $effect runs once on mount and its cleanup once
  // on unmount.
  $effect(() => {
    const animation = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  });

  const pulseScale = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.18, 1],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.55, 1],
  });

  // A class string built from a base plus whichever modifiers are on. Written out rather than
  // hidden behind a helper import because the STRING is half of what each tile demonstrates — the
  // readout under every dynamic tile prints exactly this value.
  function classList(base: string, modifiers: Record<string, boolean>): string {
    const on = Object.keys(modifiers).filter(name => modifiers[name]);
    return [base, ...on].join(' ');
  }

  function mergeReadoutFor(hasClass: boolean, hasInline: boolean): string {
    if (hasInline) return 'inline wins the fill';
    return hasClass ? 'class owns the fill' : 'no class, no inline';
  }

  const specClass = $derived(
    classList('sc-spec-tile', {
      'sc-spec-strong': isStrong,
      'sc-spec-early': hasOrderPair,
      'sc-spec-late': hasOrderPair,
    }),
  );
  const triClass = $derived(
    classList('sc-tri', {
      'sc-t-a': tokenA,
      'sc-t-b': tokenB,
      'sc-t-c': tokenC,
    }),
  );
  const mergeClass = $derived(hasMergeClass ? 'sc-merge-tile' : '');
  const mergeReadout = $derived(mergeReadoutFor(hasMergeClass, hasMergeInline));
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="style-showcase-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>

    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: LINE_COLOR.styling }}>
        <text class="hero-badge-text">ST</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Styling showcase</text>
        <text class="hero-body">
          Six stylesheets driving one screen — plain CSS, CSS Modules, SCSS,
          Less, Stylus, and a sheet of things the compiler refuses. Every tile
          is built so a dropped rule is visible rather than silent.
        </text>
      </view>
    </view>

    <!-- ---- compiled verbatim ---------------------------------------------------------- -->

    <view class="sc-panel">
      <text class="sc-panel-title">
        1 · Declarations, as the compiler emits them
      </text>
      <text class="sc-panel-note">
        lightningcss hands back a typed value tree, so a shorthand arrives
        already expanded into four sides and a corner longhand as the pair it
        really is. Neither was true of the hand-rolled evaluator this replaced.
      </text>

      <text class="sc-tile-label">SHORTHAND EXPANSION</text>
      <view class="sc-shorthand-box" testID="sc-shorthand-box">
        <view class="sc-shorthand-core" />
      </view>
      <text class="sc-tile-caption">
        padding: 6px 12px 26px 38px · border-width: 1px 4px 10px 20px — four
        different values on each. Uniform insets mean only the first value
        survived.
      </text>

      <view class="sc-pair">
        <StyleShowcaseTile
          label="BORDER-RADIUS"
          caption="the shorthand — always worked"
        >
          <view class="sc-corner-shorthand" testID="sc-corner-shorthand" />
        </StyleShowcaseTile>
        <StyleShowcaseTile
          label="FOUR LONGHANDS"
          caption="28 / 4 / 28 / 4 — a leaf. A square here is the bug this screen was built for."
        >
          <view class="sc-corner-longhand" testID="sc-corner-longhand" />
        </StyleShowcaseTile>
      </view>

      <view class="sc-pair">
        <StyleShowcaseTile
          label="BACKGROUND-IMAGE"
          caption="a real native Fabric prop"
        >
          <view class="sc-gradient-tile" testID="sc-gradient-tile" />
        </StyleShowcaseTile>
        <StyleShowcaseTile
          label="+ FILTER"
          caption="same gradient, brighter. iOS paints only brightness and opacity — the grayscale half needs RN's enableSwiftUIBasedFilters flag. Identical twins mean filter stopped arriving entirely."
        >
          <view class="sc-filter-tile" testID="sc-filter-tile" />
        </StyleShowcaseTile>
      </view>

      <view class="sc-pair">
        <StyleShowcaseTile
          label="ROTATE, DEFAULT ORIGIN"
          caption="pivots about centre"
        >
          <view class="sc-origin-frame">
            <view class="sc-origin-square" testID="sc-origin-centre" />
          </view>
        </StyleShowcaseTile>
        <StyleShowcaseTile
          label="+ TRANSFORM-ORIGIN"
          caption="top left — the same rotation, visibly offset"
        >
          <view class="sc-origin-frame">
            <view class="sc-origin-square-corner" testID="sc-origin-corner" />
          </view>
        </StyleShowcaseTile>
      </view>

      <text class="sc-tile-label">BOX-SHADOW · TWO LAYERS</text>
      <view class="sc-shadow-tile" testID="sc-shadow-tile" />
      <text class="sc-tile-caption">
        Handed through as raw CSS text and parsed by the engine's own
        processBoxShadow port, so spread radius and multiple layers survive.
      </text>
    </view>

    <!-- ---- specificity ---------------------------------------------------------------- -->

    <view class="sc-panel">
      <text class="sc-panel-title">
        2 · Specificity beats position; position breaks a tie
      </text>
      <text class="sc-panel-note">
        The file order is adversarial on purpose. `.sc-spec-tile.sc-spec-strong`
        is declared ABOVE the plain `.sc-spec-tile` and still wins the fill,
        because (0,2,0) outranks (0,1,0). `.sc-spec-early` and `.sc-spec-late`
        are equally specific, so the border goes to whichever is later in the
        file.
      </text>
      <view class={specClass} testID="sc-spec-tile">
        <text class="sc-spec-text">
          {isStrong
            ? 'green fill · compound rule won'
            : 'slate fill · base rule'}
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

    <!-- ---- compound selectors --------------------------------------------------------- -->

    <view class="sc-panel">
      <text class="sc-panel-title">
        3 · Compound selectors — eight combinations, four tokens
      </text>
      <text class="sc-panel-note">
        Rules keyed on one, two, and all three modifiers over a shared base.
        With everything on, the node carries FOUR class tokens — the count at
        which the retired collapse-and-permute registry silently stopped
        matching. Each rule restates only what it changes, so the base's size
        and centring have to survive underneath all of them.
      </text>
      <view class={triClass} testID="sc-tri-tile">
        <text class="sc-tri-text">
          {tokenA && tokenB && tokenC
            ? 'three-token rule'
            : `${[tokenA, tokenB, tokenC].filter(Boolean).length} modifier(s)`}
        </text>
      </view>
      <text class="sc-readout" testID="sc-tri-readout">{triClass}</text>
      <StyleShowcaseToggle
        testID="sc-tri-a-toggle"
        label=".sc-t-a · lime ring"
        active={tokenA}
        onToggle={() => (tokenA = !tokenA)}
      />
      <StyleShowcaseToggle
        testID="sc-tri-b-toggle"
        label=".sc-t-b · blue fill"
        active={tokenB}
        onToggle={() => (tokenB = !tokenB)}
      />
      <StyleShowcaseToggle
        testID="sc-tri-c-toggle"
        label=".sc-t-c · round"
        active={tokenC}
        onToggle={() => (tokenC = !tokenC)}
      />
    </view>

    <!-- ---- class + inline style ------------------------------------------------------- -->

    <view class="sc-panel">
      <text class="sc-panel-title">
        4 · A class and an inline style on one node
      </text>
      <text class="sc-panel-note">
        The engine keeps the two halves apart in a WeakMap and always writes
        them as [classStyle, explicitStyle] in that fixed order, so the explicit
        half wins whichever prop the framework happened to set last. Flip either
        half to see the other alone.
      </text>
      <view
        class={mergeClass}
        style={hasMergeInline ? { backgroundColor: '#7a1f2b' } : undefined}
        testID="sc-merge-tile"
      >
        <text class="sc-merge-text">{mergeReadout}</text>
      </view>
      <text class="sc-tile-caption">
        The lime ring and the corners come from the class either way — the
        inline object names only backgroundColor, so it overrides only that.
      </text>
      <StyleShowcaseToggle
        testID="sc-merge-class-toggle"
        label="class"
        active={hasMergeClass}
        onToggle={() => (hasMergeClass = !hasMergeClass)}
      />
      <StyleShowcaseToggle
        testID="sc-merge-inline-toggle"
        label={'style={{ backgroundColor }}'}
        active={hasMergeInline}
        onToggle={() => (hasMergeInline = !hasMergeInline)}
      />
    </view>

    <!-- ---- animation over a class ----------------------------------------------------- -->

    <view class="sc-panel">
      <text class="sc-panel-title">5 · An animation on top of a class</text>
      <text class="sc-panel-note">
        The class owns the whole static look; the Animated.Value writes only
        transform and opacity. If a frame clobbered the resolved class the tile
        would lose its ring and its corners mid-pulse rather than merely stop
        moving — the two are independent, and the ring is the tell.
      </text>
      <view class="sc-anim-frame">
        <view
          class="sc-anim-tile"
          testID="sc-anim-tile"
          style={{
            opacity: pulseOpacity,
            transform: [{ scale: pulseScale }],
          }}
        >
          <text class="sc-anim-text">class + frame</text>
        </view>
      </view>
    </view>

    <!-- ---- CSS Modules ---------------------------------------------------------------- -->

    <view class="sc-panel">
      <text class="sc-panel-title">6 · CSS Modules</text>
      <text class="sc-panel-note">
        Every class in StyleShowcase.module.css is renamed per file, so none of
        it can collide with App.css. The default export maps the AUTHORED name —
        kebab and all — to the renamed one, and css-dts generates the sibling
        .d.ts so a typo is a type error rather than the literal string
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
        composed-first, which is what lets a composer override what it composes.
        The pill shape comes from the base and survives both.
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
        keyed as itself — upstream CSS Modules omits a global, which would force
        the author back to a bare string literal.
      </text>
      <text class="sc-readout" testID="sc-chip-readout">
        {styles['sc-chip-loud']}
      </text>
    </view>

    <!-- ---- preprocessors -------------------------------------------------------------- -->

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
          class={`scss-tile${preprocessorsOn ? ' scss-tile-on' : ''}`}
          testID="sc-scss-tile"
        >
          <text class="scss-tile-text">SCSS</text>
        </view>
        <view
          class={`less-tile${preprocessorsOn ? ' less-tile-on' : ''}`}
          testID="sc-less-tile"
        >
          <text class="less-tile-text">Less</text>
        </view>
        <view
          class={`styl-tile${preprocessorsOn ? ' styl-tile-on' : ''}`}
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
      <StyleShowcaseToggle
        testID="sc-preprocessor-toggle"
        label="nested &.on rule"
        active={preprocessorsOn}
        onToggle={() => (preprocessorsOn = !preprocessorsOn)}
      />
    </view>

    <!-- ---- limits --------------------------------------------------------------------- -->

    <view class="sc-panel">
      <text class="sc-panel-title">
        8 · Deliberately not supported — and one that is wrong, not absent
      </text>
      <text class="sc-panel-note">
        Each of these prints a warning into the Metro output under the
        [@symbiote-native/css-parser] prefix, naming this file (and, for a parse
        error, line:column). If a tile below misbehaves, that log is where the
        reason is.
      </text>

      <text class="sc-tile-label">@MEDIA · @SUPPORTS · @CONTAINER</text>
      <view class="sc-limit-cond" testID="sc-limit-cond">
        <text class="sc-combo-text">must stay slate</text>
      </view>
      <text class="sc-tile-caption">
        All three are dropped whole, rules included — React Native evaluates no
        CSS condition at all. Each one here would repaint this tile red. Branch
        in JS instead: useWindowDimensions, Platform.
      </text>

      <text class="sc-tile-label">CALC() ACROSS UNIT FAMILIES</text>
      <view class="sc-limit-calc-wrap">
        <view class="sc-limit-calc-ok" testID="sc-limit-calc-ok">
          <text class="sc-limit-calc-text">width: 100% — fine</text>
        </view>
        <view class="sc-limit-calc-bad" testID="sc-limit-calc-bad">
          <text class="sc-limit-calc-text">
            width: calc(100% - 48px) — dropped
          </text>
        </view>
      </view>
      <text class="sc-tile-caption">
        RN has no unit meaning "a percentage minus points", so the declaration
        is refused rather than approximated — the red box has no width at all
        and shrinks to its text. It used to become width: 100, which RN reads as
        100 POINTS. Use flex or parent padding; calc() within one unit family
        still evaluates.
      </text>

      <text class="sc-tile-label">THE COMBINATOR — WRONG, NOT MISSING</text>
      <view class="sc-combo-parent" testID="sc-combo-parent">
        <view class="sc-combo-child" testID="sc-combo-nested-child">
          <text class="sc-combo-text">
            nested child · the web paints this red, here it stays plain
          </text>
        </view>
        <view class="sc-combo-parent sc-combo-child" testID="sc-combo-merged">
          <text class="sc-combo-text">
            both names on ONE node · the web paints nothing, here it goes red
          </text>
        </view>
      </view>
      <text class="sc-tile-caption">
        `.sc-combo-parent .sc-combo-child` keeps only its class tokens, so it
        matches exactly like `.a.b`. A descendant rule therefore never fires
        where it was meant to and does fire where it was not. Give the child its
        own class; never write a descendant, child, or sibling rule.
      </text>

      <text class="sc-tile-label">VAR() DOES NOT CROSS FILES</text>
      <view class="sc-pair">
        <StyleShowcaseTile
          label="LOCAL TOKEN"
          caption="--sc-limit-lime is declared in this sheet"
        >
          <view
            class="sc-limit-var sc-limit-var-local"
            testID="sc-limit-var-local"
          >
            <text class="sc-combo-text">resolves</text>
          </view>
        </StyleShowcaseTile>
        <StyleShowcaseTile
          label="APP.CSS TOKEN"
          caption="--mist belongs to App.css — dropped, so the ring falls back to black"
        >
          <view
            class="sc-limit-var sc-limit-var-foreign"
            testID="sc-limit-var-foreign"
          >
            <text class="sc-combo-text">dropped</text>
          </view>
        </StyleShowcaseTile>
      </view>
      <text class="sc-tile-caption">
        Custom properties are collected per compiled file and substituted at
        build time, so a token from another sheet does not exist here. Outside
        the file that declares them, write literals.
      </text>
    </view>
  </scroll-view>
</safe-area-view>
