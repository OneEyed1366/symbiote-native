import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Animated,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/react';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import styles from './StyleShowcase.module.css';
import './StyleShowcase.css';
import './StyleShowcase.limits.css';
import './showcase.scss';
import './showcase.less';
import './showcase.styl';

/**
 * The whole surface of @symbiote-native/css-parser on one screen — what it does, and what it
 * deliberately does not.
 *
 * This is a showcase, not a conformance harness, but it is built so that a regression PAINTS.
 * Every tile is a pair or a shape whose failure mode is visible from across the room: the
 * corner-radius tile goes square, the filtered tile becomes its own twin, the limits tiles turn
 * red. That bias exists because `border-top-left-radius` shipped silently dropped and survived
 * until somebody happened to look at a corner on a device — a screen where a dropped rule is
 * invisible would not have caught it either.
 *
 * Six sheets, one per mechanism, so the pipeline is legible from the file tree alone:
 *   StyleShowcase.css          plain global sheet
 *   StyleShowcase.module.css   CSS Modules — composes chain, :global(), authored keys
 *   showcase.scss/.less/.styl  the three preprocessors, first end-to-end use in this repo
 *   StyleShowcase.limits.css   the deliberately-unsupported section
 *
 * Every dynamic tile works by changing the SET OF CLASSES ON THE NODE ITSELF. That is not a
 * workaround for the lack of a runtime cascade — `var()` is substituted at build time and a
 * combinator does not descend, so the class set is where all the interesting behaviour lives.
 */

// One toggle row shape, reused by every interactive tile. `color` is the ActionButton tint the
// rest of the app already uses to colour-code a feature.
type IToggleProps = {
  label: string;
  active: boolean;
  onToggle: () => void;
  testID: string;
};

function Toggle({ label, active, onToggle, testID }: IToggleProps) {
  return (
    <ActionButton
      testID={testID}
      title={`${label} — ${active ? 'on' : 'off'}`}
      // The off tint used to be #41506a, which is ~1.9:1 against .action-button's own --paper
      // fill — the title of an inactive toggle was unreadable, so you could not tell which rule
      // you were about to switch on. A mid slate stays clearly "off" beside the lime without
      // disappearing into the button.
      color={active ? LINE_COLOR.styling : '#8ea3c6'}
      onPress={onToggle}
    />
  );
}

type ITileProps = {
  label: string;
  caption: string;
  children: ReactNode;
};

function Tile({ label, caption, children }: ITileProps) {
  return (
    <View className="sc-pair-half">
      <Text className="sc-tile-label">{label}</Text>
      {children}
      <Text className="sc-tile-caption">{caption}</Text>
    </View>
  );
}

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

export function StyleShowcaseScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StyleShowcase];

  const [isStrong, setIsStrong] = useState(false);
  const [hasOrderPair, setHasOrderPair] = useState(false);
  const [tokenA, setTokenA] = useState(false);
  const [tokenB, setTokenB] = useState(false);
  const [tokenC, setTokenC] = useState(false);
  const [hasMergeClass, setHasMergeClass] = useState(true);
  const [hasMergeInline, setHasMergeInline] = useState(false);
  const [preprocessorsOn, setPreprocessorsOn] = useState(false);

  const pulse = useRef(new Animated.Value(0)).current;

  // A single looping timing on the native driver: the curve lives in NativeAnimated, so an
  // always-on pulse costs no per-frame JS on a screen the user may leave open. The class-derived
  // style is written once at mount and the frames never touch it.
  //
  // The JS driver would survive too, for a reason worth knowing rather than assuming: its
  // per-frame setNativeProps MERGES onto flattenStyle(node.props.style), and that value is the
  // [classStyle, explicitStyle] array routeProp wrote — so the class is inside what the frame
  // merges over, not something it replaces (core/engine/src/commit.ts's setNativeProps).
  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.18, 1],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.55, 1],
  });

  const specClass = classList('sc-spec-tile', {
    'sc-spec-strong': isStrong,
    'sc-spec-early': hasOrderPair,
    'sc-spec-late': hasOrderPair,
  });
  const triClass = classList('sc-tri', {
    'sc-t-a': tokenA,
    'sc-t-b': tokenB,
    'sc-t-c': tokenC,
  });
  const mergeClass = hasMergeClass ? 'sc-merge-tile' : '';
  const mergeReadout = mergeReadoutFor(hasMergeClass, hasMergeInline);

  return (
    <SafeAreaView className="screen">
      <ScrollView
        testID="style-showcase-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>

        <View className="hero-card">
          <View
            className="hero-badge"
            style={{ backgroundColor: LINE_COLOR.styling }}
          >
            <Text className="hero-badge-text">ST</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Styling showcase</Text>
            <Text className="hero-body">
              Six stylesheets driving one screen — plain CSS, CSS Modules, SCSS,
              Less, Stylus, and a sheet of things the compiler refuses. Every
              tile is built so a dropped rule is visible rather than silent.
            </Text>
          </View>
        </View>

        {/* ---- compiled verbatim ------------------------------------------------------- */}

        <View className="sc-panel">
          <Text className="sc-panel-title">
            1 · Declarations, as the compiler emits them
          </Text>
          <Text className="sc-panel-note">
            lightningcss hands back a typed value tree, so a shorthand arrives
            already expanded into four sides and a corner longhand as the pair
            it really is. Neither was true of the hand-rolled evaluator this
            replaced.
          </Text>

          <Text className="sc-tile-label">SHORTHAND EXPANSION</Text>
          <View className="sc-shorthand-box" testID="sc-shorthand-box">
            <View className="sc-shorthand-core" />
          </View>
          <Text className="sc-tile-caption">
            padding: 6px 12px 26px 38px · border-width: 1px 4px 10px 20px — four
            different values on each. Uniform insets mean only the first value
            survived.
          </Text>

          <View className="sc-pair">
            <Tile label="BORDER-RADIUS" caption="the shorthand — always worked">
              <View
                className="sc-corner-shorthand"
                testID="sc-corner-shorthand"
              />
            </Tile>
            <Tile
              label="FOUR LONGHANDS"
              caption="28 / 4 / 28 / 4 — a leaf. A square here is the bug this screen was built for."
            >
              <View
                className="sc-corner-longhand"
                testID="sc-corner-longhand"
              />
            </Tile>
          </View>

          <View className="sc-pair">
            <Tile label="BACKGROUND-IMAGE" caption="a real native Fabric prop">
              <View className="sc-gradient-tile" testID="sc-gradient-tile" />
            </Tile>
            <Tile
              label="+ FILTER"
              caption="same gradient, brighter. iOS paints only brightness and opacity — the
                grayscale half needs RN's enableSwiftUIBasedFilters flag. Identical twins mean
                filter stopped arriving entirely."
            >
              <View className="sc-filter-tile" testID="sc-filter-tile" />
            </Tile>
          </View>

          <View className="sc-pair">
            <Tile label="ROTATE, DEFAULT ORIGIN" caption="pivots about centre">
              <View className="sc-origin-frame">
                <View className="sc-origin-square" testID="sc-origin-centre" />
              </View>
            </Tile>
            <Tile
              label="+ TRANSFORM-ORIGIN"
              caption="top left — the same rotation, visibly offset"
            >
              <View className="sc-origin-frame">
                <View
                  className="sc-origin-square-corner"
                  testID="sc-origin-corner"
                />
              </View>
            </Tile>
          </View>

          <Text className="sc-tile-label">BOX-SHADOW · TWO LAYERS</Text>
          <View className="sc-shadow-tile" testID="sc-shadow-tile" />
          <Text className="sc-tile-caption">
            Handed through as raw CSS text and parsed by the engine's own
            processBoxShadow port, so spread radius and multiple layers survive.
          </Text>
        </View>

        {/* ---- specificity ------------------------------------------------------------- */}

        <View className="sc-panel">
          <Text className="sc-panel-title">
            2 · Specificity beats position; position breaks a tie
          </Text>
          <Text className="sc-panel-note">
            The file order is adversarial on purpose. `.sc-spec-tile.sc-spec-
            strong` is declared ABOVE the plain `.sc-spec-tile` and still wins
            the fill, because (0,2,0) outranks (0,1,0). `.sc-spec-early` and
            `.sc-spec-late` are equally specific, so the border goes to
            whichever is later in the file.
          </Text>
          <View className={specClass} testID="sc-spec-tile">
            <Text className="sc-spec-text">
              {isStrong
                ? 'green fill · compound rule won'
                : 'slate fill · base rule'}
            </Text>
          </View>
          <Text className="sc-readout" testID="sc-spec-readout">
            {specClass}
          </Text>
          <Text className="sc-tile-caption">
            {hasOrderPair
              ? 'border is sky blue — .sc-spec-late is the later line of the equal-specificity pair'
              : 'border is slate — neither of the equal-specificity pair is on the node'}
          </Text>
          <Toggle
            testID="sc-spec-strong-toggle"
            label=".sc-spec-strong"
            active={isStrong}
            onToggle={() => setIsStrong(current => !current)}
          />
          <Toggle
            testID="sc-spec-order-toggle"
            label=".sc-spec-early + .sc-spec-late"
            active={hasOrderPair}
            onToggle={() => setHasOrderPair(current => !current)}
          />
        </View>

        {/* ---- compound selectors ------------------------------------------------------ */}

        <View className="sc-panel">
          <Text className="sc-panel-title">
            3 · Compound selectors — eight combinations, four tokens
          </Text>
          <Text className="sc-panel-note">
            Rules keyed on one, two, and all three modifiers over a shared base.
            With everything on, the node carries FOUR class tokens — the count
            at which the retired collapse-and-permute registry silently stopped
            matching. Each rule restates only what it changes, so the base's
            size and centring have to survive underneath all of them.
          </Text>
          <View className={triClass} testID="sc-tri-tile">
            <Text className="sc-tri-text">
              {tokenA && tokenB && tokenC
                ? 'three-token rule'
                : `${[tokenA, tokenB, tokenC].filter(Boolean).length} modifier(s)`}
            </Text>
          </View>
          <Text className="sc-readout" testID="sc-tri-readout">
            {triClass}
          </Text>
          <Toggle
            testID="sc-tri-a-toggle"
            label=".sc-t-a · lime ring"
            active={tokenA}
            onToggle={() => setTokenA(current => !current)}
          />
          <Toggle
            testID="sc-tri-b-toggle"
            label=".sc-t-b · blue fill"
            active={tokenB}
            onToggle={() => setTokenB(current => !current)}
          />
          <Toggle
            testID="sc-tri-c-toggle"
            label=".sc-t-c · round"
            active={tokenC}
            onToggle={() => setTokenC(current => !current)}
          />
        </View>

        {/* ---- class + inline style ---------------------------------------------------- */}

        <View className="sc-panel">
          <Text className="sc-panel-title">
            4 · A class and an inline style on one node
          </Text>
          <Text className="sc-panel-note">
            The engine keeps the two halves apart in a WeakMap and always writes
            them as [classStyle, explicitStyle] in that fixed order, so the
            explicit half wins whichever prop the framework happened to set
            last. Flip either half to see the other alone.
          </Text>
          <View
            className={mergeClass}
            style={hasMergeInline ? { backgroundColor: '#7a1f2b' } : undefined}
            testID="sc-merge-tile"
          >
            <Text className="sc-merge-text">{mergeReadout}</Text>
          </View>
          <Text className="sc-tile-caption">
            The lime ring and the corners come from the class either way — the
            inline object names only backgroundColor, so it overrides only that.
          </Text>
          <Toggle
            testID="sc-merge-class-toggle"
            label="className"
            active={hasMergeClass}
            onToggle={() => setHasMergeClass(current => !current)}
          />
          <Toggle
            testID="sc-merge-inline-toggle"
            label="style={{ backgroundColor }}"
            active={hasMergeInline}
            onToggle={() => setHasMergeInline(current => !current)}
          />
        </View>

        {/* ---- animation over a class -------------------------------------------------- */}

        <View className="sc-panel">
          <Text className="sc-panel-title">
            5 · An animation on top of a class
          </Text>
          <Text className="sc-panel-note">
            The class owns the whole static look; the Animated.Value writes only
            transform and opacity. If a frame clobbered the resolved class the
            tile would lose its ring and its corners mid-pulse rather than
            merely stop moving — the two are independent, and the ring is the
            tell.
          </Text>
          <View className="sc-anim-frame">
            <Animated.View
              className="sc-anim-tile"
              testID="sc-anim-tile"
              style={{
                opacity: pulseOpacity,
                transform: [{ scale: pulseScale }],
              }}
            >
              <Text className="sc-anim-text">class + frame</Text>
            </Animated.View>
          </View>
        </View>

        {/* ---- CSS Modules ------------------------------------------------------------- */}

        <View className="sc-panel">
          <Text className="sc-panel-title">6 · CSS Modules</Text>
          <Text className="sc-panel-note">
            Every class in StyleShowcase.module.css is renamed per file, so none
            of it can collide with App.css. The default export maps the AUTHORED
            name — kebab and all — to the renamed one, and css-dts generates the
            sibling .d.ts so a typo is a type error rather than the literal
            string "undefined" reaching the class prop.
          </Text>
          <View className="sc-chip-row">
            <View className={styles['sc-chip-base']} testID="sc-chip-base">
              <Text className={styles['sc-chip-text']}>base</Text>
            </View>
            <View className={styles['sc-chip-tinted']} testID="sc-chip-tinted">
              <Text className={styles['sc-chip-text']}>composes base</Text>
            </View>
            <View className={styles['sc-chip-loud']} testID="sc-chip-loud">
              <Text className={styles['sc-chip-text']}>composes tinted</Text>
            </View>
          </View>
          <Text className="sc-tile-caption">
            Two hops of composes. Each hop restates only background-color, so
            the three fills read left to right in the emitted token order —
            composed-first, which is what lets a composer override what it
            composes. The pill shape comes from the base and survives both.
          </Text>
          <View className="sc-chip-row">
            <View
              className={`${styles['sc-chip-loud']} ${styles['sc-global-mark']}`}
              testID="sc-chip-global"
            >
              <Text className={styles['sc-chip-text']}>+ :global mark</Text>
            </View>
          </View>
          <Text className="sc-tile-caption">
            :global(.sc-global-mark) opts out of the rename, so it registers
            under its bare name and squares off two corners of the pill. We
            export it keyed as itself — upstream CSS Modules omits a global,
            which would force the author back to a bare string literal.
          </Text>
          <Text className="sc-readout" testID="sc-chip-readout">
            {styles['sc-chip-loud']}
          </Text>
        </View>

        {/* ---- preprocessors ----------------------------------------------------------- */}

        <View className="sc-panel">
          <Text className="sc-panel-title">7 · SCSS · Less · Stylus</Text>
          <Text className="sc-panel-note">
            Each source reduces to plain CSS before the compiler sees it, so
            everything above applies identically regardless of language. Each
            tile leans on a variable, a parametric mixin, and arithmetic, so its
            padding is a number the source never spells — 26 / 22 / 18 px, from
            13 / 11 / 9 doubled.
          </Text>
          <View className="sc-chip-row">
            <View
              className={`scss-tile${preprocessorsOn ? ' scss-tile-on' : ''}`}
              testID="sc-scss-tile"
            >
              <Text className="scss-tile-text">SCSS</Text>
            </View>
            <View
              className={`less-tile${preprocessorsOn ? ' less-tile-on' : ''}`}
              testID="sc-less-tile"
            >
              <Text className="less-tile-text">Less</Text>
            </View>
            <View
              className={`styl-tile${preprocessorsOn ? ' styl-tile-on' : ''}`}
              testID="sc-styl-tile"
            >
              <Text className="styl-tile-text">Stylus</Text>
            </View>
          </View>
          <Text className="sc-tile-caption">
            Three different corner radii (14 / 18 / 22) from three mixin calls.
            The toggle turns on each file's `&.x-tile-on` nest, which compiles
            to a COMPOUND selector — nesting that produced a descendant would
            hit the limit two panels down.
          </Text>
          <Toggle
            testID="sc-preprocessor-toggle"
            label="nested &.on rule"
            active={preprocessorsOn}
            onToggle={() => setPreprocessorsOn(current => !current)}
          />
        </View>

        {/* ---- limits ------------------------------------------------------------------ */}

        <View className="sc-panel">
          <Text className="sc-panel-title">
            8 · Deliberately not supported — and one that is wrong, not absent
          </Text>
          <Text className="sc-panel-note">
            Each of these prints a warning into the Metro output under the
            [@symbiote-native/css-parser] prefix, naming this file (and, for a
            parse error, line:column). If a tile below misbehaves, that log is
            where the reason is.
          </Text>

          <Text className="sc-tile-label">@MEDIA · @SUPPORTS · @CONTAINER</Text>
          <View className="sc-limit-cond" testID="sc-limit-cond">
            <Text className="sc-combo-text">must stay slate</Text>
          </View>
          <Text className="sc-tile-caption">
            All three are dropped whole, rules included — React Native evaluates
            no CSS condition at all. Each one here would repaint this tile red.
            Branch in JS instead: useWindowDimensions, Platform.
          </Text>

          <Text className="sc-tile-label">CALC() ACROSS UNIT FAMILIES</Text>
          <View className="sc-limit-calc-wrap">
            <View className="sc-limit-calc-ok" testID="sc-limit-calc-ok">
              <Text className="sc-limit-calc-text">width: 100% — fine</Text>
            </View>
            <View className="sc-limit-calc-bad" testID="sc-limit-calc-bad">
              <Text className="sc-limit-calc-text">
                width: calc(100% - 48px) — dropped
              </Text>
            </View>
          </View>
          <Text className="sc-tile-caption">
            RN has no unit meaning "a percentage minus points", so the
            declaration is refused rather than approximated — the red box has no
            width at all and shrinks to its text. It used to become width: 100,
            which RN reads as 100 POINTS. Use flex or parent padding; calc()
            within one unit family still evaluates.
          </Text>

          <Text className="sc-tile-label">
            THE COMBINATOR — WRONG, NOT MISSING
          </Text>
          <View className="sc-combo-parent" testID="sc-combo-parent">
            <View className="sc-combo-child" testID="sc-combo-nested-child">
              <Text className="sc-combo-text">
                nested child · the web paints this red, here it stays plain
              </Text>
            </View>
            <View
              className="sc-combo-parent sc-combo-child"
              testID="sc-combo-merged"
            >
              <Text className="sc-combo-text">
                both names on ONE node · the web paints nothing, here it goes
                red
              </Text>
            </View>
          </View>
          <Text className="sc-tile-caption">
            `.sc-combo-parent .sc-combo-child` keeps only its class tokens, so
            it matches exactly like `.a.b`. A descendant rule therefore never
            fires where it was meant to and does fire where it was not. Give the
            child its own class; never write a descendant, child, or sibling
            rule.
          </Text>

          <Text className="sc-tile-label">VAR() DOES NOT CROSS FILES</Text>
          <View className="sc-pair">
            <Tile
              label="LOCAL TOKEN"
              caption="--sc-limit-lime is declared in this sheet"
            >
              <View
                className="sc-limit-var sc-limit-var-local"
                testID="sc-limit-var-local"
              >
                <Text className="sc-combo-text">resolves</Text>
              </View>
            </Tile>
            <Tile
              label="APP.CSS TOKEN"
              caption="--mist belongs to App.css — dropped, so the ring falls back to black"
            >
              <View
                className="sc-limit-var sc-limit-var-foreign"
                testID="sc-limit-var-foreign"
              >
                <Text className="sc-combo-text">dropped</Text>
              </View>
            </Tile>
          </View>
          <Text className="sc-tile-caption">
            Custom properties are collected per compiled file and substituted at
            build time, so a token from another sheet does not exist here.
            Outside the file that declares them, write literals.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
