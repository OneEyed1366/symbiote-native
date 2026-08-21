// The whole surface of @symbiote-native/css-parser on one screen — what it does, and what it
// deliberately does not. Ported from examples/react/screens/StyleShowcaseScreen.tsx; the six
// stylesheets are byte-identical copies, because the class registry is framework-agnostic and
// each example is its own app with its own flat registry.
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
// Every dynamic tile works by changing the SET OF CLASSES ON THE NODE ITSELF. That is not a
// workaround for the lack of a runtime cascade — `var()` is substituted at build time and a
// combinator does not descend, so the class set is where all the interesting behaviour lives.
//
// SOLID SPECIFICS. Nothing here destructures `props`, and every derived class string stays a
// FUNCTION read at its use site: a component body runs once, so a snapshot would freeze the tile
// at its mount-time class set. The pulse is a plain const rather than React's
// `useRef(...).current` for the same reason.

import { createSignal, onCleanup, onMount } from 'solid-js';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import {
  Animated,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/solid';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import styles from './StyleShowcase.module.css';
import './StyleShowcase.css';
import './StyleShowcase.limits.css';
import './showcase.scss';
import './showcase.less';
import './showcase.styl';

const PULSE_DURATION_MS = 1_600;

// One toggle row shape, reused by every interactive tile. `color` is the ActionButton tint the
// rest of the app already uses to colour-code a feature.
type IToggleProps = {
  label: string;
  active: boolean;
  onToggle: () => void;
  testID: string;
};

function Toggle(props: IToggleProps) {
  return (
    <ActionButton
      testID={props.testID}
      title={`${props.label} — ${props.active ? 'on' : 'off'}`}
      color={props.active ? LINE_COLOR.styling : '#41506a'}
      onPress={() => props.onToggle()}
    />
  );
}

type ITileProps = {
  label: string;
  caption: string;
  children?: JSX.Element;
};

function Tile(props: ITileProps) {
  return (
    <View class="sc-pair-half">
      <Text class="sc-tile-label">{props.label}</Text>
      {props.children}
      <Text class="sc-tile-caption">{props.caption}</Text>
    </View>
  );
}

// A class string built from a base plus whichever modifiers are on. Written out rather than
// hidden behind a helper import because the STRING is half of what each tile demonstrates — the
// readout under every dynamic tile prints exactly this value. Unrelated to Solid's DOM-only
// `classList` prop: the engine takes one merged string through `class`.
function classList(base: string, modifiers: Record<string, boolean>): string {
  const on = Object.keys(modifiers).filter(name => modifiers[name]);
  return [base, ...on].join(' ');
}

function mergeReadoutFor(hasClass: boolean, hasInline: boolean): string {
  if (hasInline) return 'inline wins the fill';
  return hasClass ? 'class owns the fill' : 'no class, no inline';
}

export function StyleShowcaseScreen() {
  // A module constant indexed by a literal — nothing here to keep reactive.
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StyleShowcase];

  const [isStrong, setIsStrong] = createSignal(false);
  const [hasOrderPair, setHasOrderPair] = createSignal(false);
  const [tokenA, setTokenA] = createSignal(false);
  const [tokenB, setTokenB] = createSignal(false);
  const [tokenC, setTokenC] = createSignal(false);
  const [hasMergeClass, setHasMergeClass] = createSignal(true);
  const [hasMergeInline, setHasMergeInline] = createSignal(false);
  const [preprocessorsOn, setPreprocessorsOn] = createSignal(false);

  const pulse = new Animated.Value(0);

  // A single looping timing on the native driver: the curve lives in NativeAnimated, so an
  // always-on pulse costs no per-frame JS on a screen the user may leave open. The class-derived
  // style is written once at mount and the frames never touch it.
  //
  // The JS driver would survive too, for a reason worth knowing rather than assuming: its
  // per-frame setNativeProps MERGES onto flattenStyle(node.props.style), and that value is the
  // [classStyle, explicitStyle] array routeProp wrote — so the class is inside what the frame
  // merges over, not something it replaces (core/engine/src/commit.ts's setNativeProps).
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

  const pulseScale = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.18, 1],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.55, 1],
  });

  const specClass = () =>
    classList('sc-spec-tile', {
      'sc-spec-strong': isStrong(),
      'sc-spec-early': hasOrderPair(),
      'sc-spec-late': hasOrderPair(),
    });
  const triClass = () =>
    classList('sc-tri', {
      'sc-t-a': tokenA(),
      'sc-t-b': tokenB(),
      'sc-t-c': tokenC(),
    });
  const mergeClass = () => (hasMergeClass() ? 'sc-merge-tile' : '');
  const mergeReadout = () => mergeReadoutFor(hasMergeClass(), hasMergeInline());
  const tokenCount = () =>
    [tokenA(), tokenB(), tokenC()].filter(Boolean).length;

  return (
    <SafeAreaView class="screen">
      <ScrollView
        testID="style-showcase-scroll"
        class="screen"
        contentContainerStyle="demo-section"
      >
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>

        <View class="hero-card">
          <View
            class="hero-badge"
            style={{ backgroundColor: LINE_COLOR.styling }}
          >
            <Text class="hero-badge-text">ST</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Styling showcase</Text>
            <Text class="hero-body">
              Six stylesheets driving one screen — plain CSS, CSS Modules, SCSS,
              Less, Stylus, and a sheet of things the compiler refuses. Every
              tile is built so a dropped rule is visible rather than silent.
            </Text>
          </View>
        </View>

        {/* ---- compiled verbatim ------------------------------------------------------- */}

        <View class="sc-panel">
          <Text class="sc-panel-title">
            1 · Declarations, as the compiler emits them
          </Text>
          <Text class="sc-panel-note">
            lightningcss hands back a typed value tree, so a shorthand arrives
            already expanded into four sides and a corner longhand as the pair
            it really is. Neither was true of the hand-rolled evaluator this
            replaced.
          </Text>

          <Text class="sc-tile-label">SHORTHAND EXPANSION</Text>
          <View class="sc-shorthand-box" testID="sc-shorthand-box">
            <View class="sc-shorthand-core" />
          </View>
          <Text class="sc-tile-caption">
            padding: 6px 12px 26px 38px · border-width: 1px 4px 10px 20px — four
            different values on each. Uniform insets mean only the first value
            survived.
          </Text>

          <View class="sc-pair">
            <Tile label="BORDER-RADIUS" caption="the shorthand — always worked">
              <View class="sc-corner-shorthand" testID="sc-corner-shorthand" />
            </Tile>
            <Tile
              label="FOUR LONGHANDS"
              caption="28 / 4 / 28 / 4 — a leaf. A square here is the bug this screen was built for."
            >
              <View class="sc-corner-longhand" testID="sc-corner-longhand" />
            </Tile>
          </View>

          <View class="sc-pair">
            <Tile label="BACKGROUND-IMAGE" caption="a real native Fabric prop">
              <View class="sc-gradient-tile" testID="sc-gradient-tile" />
            </Tile>
            <Tile
              label="+ FILTER"
              caption="same gradient, brighter. iOS paints only brightness and opacity — the
                grayscale half needs RN's enableSwiftUIBasedFilters flag. Identical twins mean
                filter stopped arriving entirely."
            >
              <View class="sc-filter-tile" testID="sc-filter-tile" />
            </Tile>
          </View>

          <View class="sc-pair">
            <Tile label="ROTATE, DEFAULT ORIGIN" caption="pivots about centre">
              <View class="sc-origin-frame">
                <View class="sc-origin-square" testID="sc-origin-centre" />
              </View>
            </Tile>
            <Tile
              label="+ TRANSFORM-ORIGIN"
              caption="top left — the same rotation, visibly offset"
            >
              <View class="sc-origin-frame">
                <View
                  class="sc-origin-square-corner"
                  testID="sc-origin-corner"
                />
              </View>
            </Tile>
          </View>

          <Text class="sc-tile-label">BOX-SHADOW · TWO LAYERS</Text>
          <View class="sc-shadow-tile" testID="sc-shadow-tile" />
          <Text class="sc-tile-caption">
            Handed through as raw CSS text and parsed by the engine's own
            processBoxShadow port, so spread radius and multiple layers survive.
          </Text>
        </View>

        {/* ---- specificity ------------------------------------------------------------- */}

        <View class="sc-panel">
          <Text class="sc-panel-title">
            2 · Specificity beats position; position breaks a tie
          </Text>
          <Text class="sc-panel-note">
            The file order is adversarial on purpose. `.sc-spec-tile.sc-spec-
            strong` is declared ABOVE the plain `.sc-spec-tile` and still wins
            the fill, because (0,2,0) outranks (0,1,0). `.sc-spec-early` and
            `.sc-spec-late` are equally specific, so the border goes to
            whichever is later in the file.
          </Text>
          <View class={specClass()} testID="sc-spec-tile">
            <Text class="sc-spec-text">
              {isStrong()
                ? 'green fill · compound rule won'
                : 'slate fill · base rule'}
            </Text>
          </View>
          <Text class="sc-readout" testID="sc-spec-readout">
            {specClass()}
          </Text>
          <Text class="sc-tile-caption">
            {hasOrderPair()
              ? 'border is sky blue — .sc-spec-late is the later line of the equal-specificity pair'
              : 'border is slate — neither of the equal-specificity pair is on the node'}
          </Text>
          <Toggle
            testID="sc-spec-strong-toggle"
            label=".sc-spec-strong"
            active={isStrong()}
            onToggle={() => setIsStrong(current => !current)}
          />
          <Toggle
            testID="sc-spec-order-toggle"
            label=".sc-spec-early + .sc-spec-late"
            active={hasOrderPair()}
            onToggle={() => setHasOrderPair(current => !current)}
          />
        </View>

        {/* ---- compound selectors ------------------------------------------------------ */}

        <View class="sc-panel">
          <Text class="sc-panel-title">
            3 · Compound selectors — eight combinations, four tokens
          </Text>
          <Text class="sc-panel-note">
            Rules keyed on one, two, and all three modifiers over a shared base.
            With everything on, the node carries FOUR class tokens — the count
            at which the retired collapse-and-permute registry silently stopped
            matching. Each rule restates only what it changes, so the base's
            size and centring have to survive underneath all of them.
          </Text>
          <View class={triClass()} testID="sc-tri-tile">
            <Text class="sc-tri-text">
              {tokenA() && tokenB() && tokenC()
                ? 'three-token rule'
                : `${tokenCount()} modifier(s)`}
            </Text>
          </View>
          <Text class="sc-readout" testID="sc-tri-readout">
            {triClass()}
          </Text>
          <Toggle
            testID="sc-tri-a-toggle"
            label=".sc-t-a · lime ring"
            active={tokenA()}
            onToggle={() => setTokenA(current => !current)}
          />
          <Toggle
            testID="sc-tri-b-toggle"
            label=".sc-t-b · blue fill"
            active={tokenB()}
            onToggle={() => setTokenB(current => !current)}
          />
          <Toggle
            testID="sc-tri-c-toggle"
            label=".sc-t-c · round"
            active={tokenC()}
            onToggle={() => setTokenC(current => !current)}
          />
        </View>

        {/* ---- class + inline style ---------------------------------------------------- */}

        <View class="sc-panel">
          <Text class="sc-panel-title">
            4 · A class and an inline style on one node
          </Text>
          <Text class="sc-panel-note">
            The engine keeps the two halves apart in a WeakMap and always writes
            them as [classStyle, explicitStyle] in that fixed order, so the
            explicit half wins whichever prop the framework happened to set
            last. Flip either half to see the other alone.
          </Text>
          <View
            class={mergeClass()}
            style={
              hasMergeInline() ? { backgroundColor: '#7a1f2b' } : undefined
            }
            testID="sc-merge-tile"
          >
            <Text class="sc-merge-text">{mergeReadout()}</Text>
          </View>
          <Text class="sc-tile-caption">
            The lime ring and the corners come from the class either way — the
            inline object names only backgroundColor, so it overrides only that.
          </Text>
          <Toggle
            testID="sc-merge-class-toggle"
            label="class"
            active={hasMergeClass()}
            onToggle={() => setHasMergeClass(current => !current)}
          />
          <Toggle
            testID="sc-merge-inline-toggle"
            label="style={{ backgroundColor }}"
            active={hasMergeInline()}
            onToggle={() => setHasMergeInline(current => !current)}
          />
        </View>

        {/* ---- animation over a class -------------------------------------------------- */}

        <View class="sc-panel">
          <Text class="sc-panel-title">5 · An animation on top of a class</Text>
          <Text class="sc-panel-note">
            The class owns the whole static look; the Animated.Value writes only
            transform and opacity. If a frame clobbered the resolved class the
            tile would lose its ring and its corners mid-pulse rather than
            merely stop moving — the two are independent, and the ring is the
            tell.
          </Text>
          <View class="sc-anim-frame">
            <Animated.View
              class="sc-anim-tile"
              testID="sc-anim-tile"
              style={{
                opacity: pulseOpacity,
                transform: [{ scale: pulseScale }],
              }}
            >
              <Text class="sc-anim-text">class + frame</Text>
            </Animated.View>
          </View>
        </View>

        {/* ---- CSS Modules ------------------------------------------------------------- */}

        <View class="sc-panel">
          <Text class="sc-panel-title">6 · CSS Modules</Text>
          <Text class="sc-panel-note">
            Every class in StyleShowcase.module.css is renamed per file, so none
            of it can collide with App.css. The default export maps the AUTHORED
            name — kebab and all — to the renamed one, and css-dts generates the
            sibling .d.ts so a typo is a type error rather than the literal
            string "undefined" reaching the class prop.
          </Text>
          <View class="sc-chip-row">
            <View class={styles['sc-chip-base']} testID="sc-chip-base">
              <Text class={styles['sc-chip-text']}>base</Text>
            </View>
            <View class={styles['sc-chip-tinted']} testID="sc-chip-tinted">
              <Text class={styles['sc-chip-text']}>composes base</Text>
            </View>
            <View class={styles['sc-chip-loud']} testID="sc-chip-loud">
              <Text class={styles['sc-chip-text']}>composes tinted</Text>
            </View>
          </View>
          <Text class="sc-tile-caption">
            Two hops of composes. Each hop restates only background-color, so
            the three fills read left to right in the emitted token order —
            composed-first, which is what lets a composer override what it
            composes. The pill shape comes from the base and survives both.
          </Text>
          <View class="sc-chip-row">
            <View
              class={`${styles['sc-chip-loud']} ${styles['sc-global-mark']}`}
              testID="sc-chip-global"
            >
              <Text class={styles['sc-chip-text']}>+ :global mark</Text>
            </View>
          </View>
          <Text class="sc-tile-caption">
            :global(.sc-global-mark) opts out of the rename, so it registers
            under its bare name and squares off two corners of the pill. We
            export it keyed as itself — upstream CSS Modules omits a global,
            which would force the author back to a bare string literal.
          </Text>
          <Text class="sc-readout" testID="sc-chip-readout">
            {styles['sc-chip-loud']}
          </Text>
        </View>

        {/* ---- preprocessors ----------------------------------------------------------- */}

        <View class="sc-panel">
          <Text class="sc-panel-title">7 · SCSS · Less · Stylus</Text>
          <Text class="sc-panel-note">
            Each source reduces to plain CSS before the compiler sees it, so
            everything above applies identically regardless of language. Each
            tile leans on a variable, a parametric mixin, and arithmetic, so its
            padding is a number the source never spells — 26 / 22 / 18 px, from
            13 / 11 / 9 doubled.
          </Text>
          <View class="sc-chip-row">
            <View
              class={`scss-tile${preprocessorsOn() ? ' scss-tile-on' : ''}`}
              testID="sc-scss-tile"
            >
              <Text class="scss-tile-text">SCSS</Text>
            </View>
            <View
              class={`less-tile${preprocessorsOn() ? ' less-tile-on' : ''}`}
              testID="sc-less-tile"
            >
              <Text class="less-tile-text">Less</Text>
            </View>
            <View
              class={`styl-tile${preprocessorsOn() ? ' styl-tile-on' : ''}`}
              testID="sc-styl-tile"
            >
              <Text class="styl-tile-text">Stylus</Text>
            </View>
          </View>
          <Text class="sc-tile-caption">
            Three different corner radii (14 / 18 / 22) from three mixin calls.
            The toggle turns on each file's `&.x-tile-on` nest, which compiles
            to a COMPOUND selector — nesting that produced a descendant would
            hit the limit two panels down.
          </Text>
          <Toggle
            testID="sc-preprocessor-toggle"
            label="nested &.on rule"
            active={preprocessorsOn()}
            onToggle={() => setPreprocessorsOn(current => !current)}
          />
        </View>

        {/* ---- limits ------------------------------------------------------------------ */}

        <View class="sc-panel">
          <Text class="sc-panel-title">
            8 · Deliberately not supported — and one that is wrong, not absent
          </Text>
          <Text class="sc-panel-note">
            Each of these prints a warning into the Metro output under the
            [@symbiote-native/css-parser] prefix, naming this file (and, for a
            parse error, line:column). If a tile below misbehaves, that log is
            where the reason is.
          </Text>

          <Text class="sc-tile-label">@MEDIA · @SUPPORTS · @CONTAINER</Text>
          <View class="sc-limit-cond" testID="sc-limit-cond">
            <Text class="sc-combo-text">must stay slate</Text>
          </View>
          <Text class="sc-tile-caption">
            All three are dropped whole, rules included — React Native evaluates
            no CSS condition at all. Each one here would repaint this tile red.
            Branch in JS instead: createWindowDimensions, Platform.
          </Text>

          <Text class="sc-tile-label">CALC() ACROSS UNIT FAMILIES</Text>
          <View class="sc-limit-calc-wrap">
            <View class="sc-limit-calc-ok" testID="sc-limit-calc-ok">
              <Text class="sc-limit-calc-text">width: 100% — fine</Text>
            </View>
            <View class="sc-limit-calc-bad" testID="sc-limit-calc-bad">
              <Text class="sc-limit-calc-text">
                width: calc(100% - 48px) — dropped
              </Text>
            </View>
          </View>
          <Text class="sc-tile-caption">
            RN has no unit meaning "a percentage minus points", so the
            declaration is refused rather than approximated — the red box has no
            width at all and shrinks to its text. It used to become width: 100,
            which RN reads as 100 POINTS. Use flex or parent padding; calc()
            within one unit family still evaluates.
          </Text>

          <Text class="sc-tile-label">THE COMBINATOR — WRONG, NOT MISSING</Text>
          <View class="sc-combo-parent" testID="sc-combo-parent">
            <View class="sc-combo-child" testID="sc-combo-nested-child">
              <Text class="sc-combo-text">
                nested child · the web paints this red, here it stays plain
              </Text>
            </View>
            <View
              class="sc-combo-parent sc-combo-child"
              testID="sc-combo-merged"
            >
              <Text class="sc-combo-text">
                both names on ONE node · the web paints nothing, here it goes
                red
              </Text>
            </View>
          </View>
          <Text class="sc-tile-caption">
            `.sc-combo-parent .sc-combo-child` keeps only its class tokens, so
            it matches exactly like `.a.b`. A descendant rule therefore never
            fires where it was meant to and does fire where it was not. Give the
            child its own class; never write a descendant, child, or sibling
            rule.
          </Text>

          <Text class="sc-tile-label">VAR() DOES NOT CROSS FILES</Text>
          <View class="sc-pair">
            <Tile
              label="LOCAL TOKEN"
              caption="--sc-limit-lime is declared in this sheet"
            >
              <View
                class="sc-limit-var sc-limit-var-local"
                testID="sc-limit-var-local"
              >
                <Text class="sc-combo-text">resolves</Text>
              </View>
            </Tile>
            {/* React's twin labels this "APP.CSS TOKEN" because its App.css declares --mist in
                a :root block. This canary's App.css declares no custom properties at all
                (see its comment), so the token is foreign in the stronger sense — the drop and
                the black fallback ring are identical either way. */}
            <Tile
              label="FOREIGN TOKEN"
              caption="--mist is declared in no sheet this file compiles with — dropped, so the ring falls back to black"
            >
              <View
                class="sc-limit-var sc-limit-var-foreign"
                testID="sc-limit-var-foreign"
              >
                <Text class="sc-combo-text">dropped</Text>
              </View>
            </Tile>
          </View>
          <Text class="sc-tile-caption">
            Custom properties are collected per compiled file and substituted at
            build time, so a token from another sheet does not exist here.
            Outside the file that declares them, write literals.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
