// The Solid canary surface — the every-primitive tour stop, section for section the same screen
// the React, Vue, Svelte and Angular canaries paint. Every visual here is a real component off
// @symbiote-native/solid, driven straight onto Fabric; React Native's own renderer is never in the
// path. Run with DEBUG=1 to watch each interaction commit incrementally in Metro's logs.
//
// SafeAreaView is the root and the ScrollView its only child, so the background paints the full
// screen including the status-bar strip (the inset is padding on the children, not a smaller
// frame) and the pull-to-refresh spinner lands below the notch instead of spinning behind it.
//
// THREE SOLID RULES THIS FILE OBEYS, all from .claude/rules/solid-descriptor-bridge.md:
//   §3 every control-flow component is imported explicitly — an un-imported <Show>/<For> resolves
//      against the renderer module and reads `undefined`, which fails at RUNTIME, not at build.
//   §4 Pressable's function child takes an ACCESSOR and is called untracked, so a signal read at
//      the child's top level would be frozen; every state() read below sits inside the JSX.
//   §4 a ternary must stay INLINE in the JSX — babel-preset-solid memoizes the condition only
//      there. Extracting one into a helper turns a leaf update into a subtree rebuild.
//
// Reached from MenuScreen's first row; it was the app root before the Stack navigator landed.

import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { createStore } from 'solid-js/store';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  FlatList,
  Image,
  KEYBOARD_EVENT,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  Vibration,
  View,
  createColorScheme,
  createWindowDimensions,
} from '@symbiote-native/solid';
// A real third-party native view, driven through symbiote's own wrapper (@symbiote-native/slider)
// rather than the library's React component: the wrapper registers RNCSlider's ViewConfig and
// renders the native leaf through the engine, so the SAME slider works on every adapter. App code
// and the app manifest name only @symbiote-native/slider; the native package is the wrapper's dep.
import { Slider } from '@symbiote-native/slider/solid';
import { AccessibilityDemo } from '../components/AccessibilityDemo';
import { ActionButton } from '../components/ActionButton';
import { AnimatedDemo } from '../components/AnimatedDemo';
import { AnimatedParityDemo } from '../components/AnimatedParityDemo';
import { CompoundClassDemo } from '../components/CompoundClassDemo';
import { NativeModulesDemo } from '../components/NativeModulesDemo';
import { ParityDemo } from '../components/ParityDemo';
import { PlatformColorDemo } from '../components/PlatformColorDemo';
import { RefApiDemo } from '../components/RefApiDemo';
import { ResponderDemo } from '../components/ResponderDemo';
import { nativeNumber } from '../components/event-utils';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import './CanaryScreen.css';

// Hoisted, not inlined at the prop: a component identity that changes every render would remount
// the dividers on every list update.
function MvcpDivider() {
  return <View class="mvcp-divider" />;
}

const CHIP_WIDTH = 72;
const CHIP_GAP = 12;
const REFRESH_MS = 2000;
const FREEZE_MS = 3000;

interface IChip {
  id: string;
  index: number;
  color: string;
}

const CHIPS: ReadonlyArray<IChip> = Array.from(
  { length: 24 },
  (_value, index) => ({
    id: `chip-${index}`,
    index,
    color: `hsl(${(index * 37) % 360} 70% 55%)`,
  }),
);

const SCROLL_ROWS: ReadonlyArray<number> = Array.from(
  { length: 6 },
  (_value, index) => index,
);

interface IMvcpRow {
  id: string;
  label: string;
}

function makeRows(from: number, count: number): ReadonlyArray<IMvcpRow> {
  return Array.from({ length: count }, (_value, index) => {
    const n = from + index;
    return { id: `row-${n}`, label: `item ${n}` };
  });
}

export function CanaryScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Canary];

  const [count, setCount] = createSignal(0);
  const [name, setName] = createSignal('');
  const [spinning, setSpinning] = createSignal(true);
  const [volume, setVolume] = createSignal(0.5);
  const [modalVisible, setModalVisible] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [refreshes, setRefreshes] = createSignal(0);
  const [keyboardHeight, setKeyboardHeight] = createSignal(0);
  const [statusBarHidden, setStatusBarHidden] = createSignal(false);
  const [darkStatusBar, setDarkStatusBar] = createSignal(false);
  // Android-only StatusBar window flags: the blank-risk pair.
  const [statusBarRed, setStatusBarRed] = createSignal(false);
  const [statusBarTranslucent, setStatusBarTranslucent] = createSignal(false);
  const [kavEnabled, setKavEnabled] = createSignal(true);

  // Feature-parity device checks: state for the cluster before the final logo. A store, not a
  // signal holding an object — both fields land in one native event and a store updates them
  // without minting a new object for the leaf to re-read.
  const [retentionMove, setRetentionMove] = createStore({ dx: 0, dy: 0 });
  const [mvcpItems, setMvcpItems] = createSignal<ReadonlyArray<IMvcpRow>>(
    makeRows(0, 20),
  );
  // Plain `let`, not a ref: a Solid component body runs once, so a closure variable already has
  // the identity-stable-across-renders property useRef exists to give React.
  let mvcpHead = 0;

  // native-driver scroll value: Animated.event attaches it on the UI thread, so the header
  // opacity/translateY are driven without a JS frame per scroll tick.
  const parityScrollY = new Animated.Value(0);

  // Tier B runtime modules, read live: both are ACCESSORS over the engine's own
  // Appearance / Dimensions event sources, spelled create* rather than use* because in Solid a
  // function that creates its own state and owns a subscription is a createX.
  const window = createWindowDimensions();
  const colorScheme = createColorScheme();
  const [appState, setAppState] = createSignal<string>(
    AppState.currentState ?? 'unknown',
  );

  // native -> JS: the device hub pushes keyboard frames; we read the height live.
  onMount(() => {
    const onShow = (payload: unknown) => {
      const height =
        typeof payload === 'object' &&
        payload !== null &&
        'endCoordinates' in payload &&
        typeof payload.endCoordinates === 'object' &&
        payload.endCoordinates !== null &&
        'height' in payload.endCoordinates &&
        typeof payload.endCoordinates.height === 'number'
          ? payload.endCoordinates.height
          : 0;
      setKeyboardHeight(height);
    };
    const subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didHide, () => setKeyboardHeight(0)),
    ];
    onCleanup(() =>
      subscriptions.forEach(subscription => subscription.remove()),
    );
  });

  // native -> JS: AppState pushes lifecycle changes; read the current phase live.
  onMount(() => {
    const subscription = AppState.addEventListener(
      'change',
      (...args: unknown[]) => {
        const next = args[0];
        if (typeof next === 'string') setAppState(next);
      },
    );
    onCleanup(() => subscription.remove());
  });

  const onRefresh = (): void => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setRefreshes(value => value + 1);
    }, REFRESH_MS);
  };

  // JS -> native imperative modules. A Promise reject (no native module / user cancel) is
  // expected, so it's swallowed; this is a demo, not a flow to handle.
  const onShare = (): void => {
    void Share.share({
      message: 'Sent from symbiote',
      url: 'https://www.solidjs.com',
    }).catch(() => {});
  };
  const onAlert = (): void => {
    Alert.alert('symbiote', 'Native AlertManager reached.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Vibrate', onPress: () => Vibration.vibrate() },
    ]);
  };
  const onActionSheet = (): void => {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Share', 'Vibrate', 'Cancel'], cancelButtonIndex: 2 },
      (index: number) => {
        if (index === 0) onShare();
        if (index === 1) Vibration.vibrate();
      },
    );
  };
  const onOpenUrl = (): void => {
    void Linking.openURL('https://www.solidjs.com').catch(() => {});
  };

  const prependRows = (): void => {
    mvcpHead -= 5;
    const prepended = makeRows(mvcpHead, 5);
    setMvcpItems(items => [...prepended, ...items]);
  };

  return (
    <SafeAreaView class="screen">
      <ScrollView
        testID="canary-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
        refreshControl={
          <RefreshControl
            refreshing={refreshing()}
            onRefresh={onRefresh}
            tintColor={LINE_COLOR.primitives}
          />
        }
      >
        {/* JS->native: StatusBar renders nothing; it drives the iOS status bar (the top strip:
            clock, wi-fi, battery) imperatively from these props. */}
        <StatusBar
          barStyle={darkStatusBar() ? 'dark-content' : 'light-content'}
          hidden={statusBarHidden()}
          animated
        />
        <View class="line-tag line-tag-primitives">
          <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View class="hero-card">
          <View
            class="hero-badge"
            style={{ backgroundColor: LINE_COLOR.primitives }}
          >
            <Text class="hero-badge-text">CN</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">All primitives</Text>
            <Text class="hero-body">
              Every @symbiote-native/solid primitive, driven straight onto
              Fabric — no react-native renderer in the path.
            </Text>
          </View>
        </View>
        {/* native->JS: keyboard height pushed from the device hub, read live */}
        <Text class="header-note">
          {keyboardHeight() > 0
            ? `keyboard up · ${keyboardHeight()}px`
            : 'keyboard down'}
        </Text>
        {/* Tier A runtime modules, read live from the real native side. A non-empty Version proves
            PlatformConstants resolved; a fractional hairline (e.g. 0.333 on @3x) proves DeviceInfo's
            scale resolved. The border below IS that hairline. borderTopWidth stays dynamic
            (StyleSheet.hairlineWidth is a runtime constant). */}
        <Text
          class="hairline-note"
          style={{ borderTopWidth: StyleSheet.hairlineWidth }}
        >
          {`${Platform.OS} ${Platform.Version}` +
            `${Platform.isPad ? ' · iPad' : ''}` +
            ` · ${Platform.select({ ios: 'native ios', android: 'native android', default: '?' })}` +
            ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`}
        </Text>
        {/* Tier B runtime modules, live. Real w×h@scale proves Dimensions + PixelRatio; a
            colorScheme proves Appearance; appState flips when you background the app. */}
        <Text class="header-note">
          {`${Math.round(window().width)}×${Math.round(window().height)} @${PixelRatio.get()}x` +
            ` · ${colorScheme() ?? 'no-scheme'} · ${appState()}`}
        </Text>
        {/* JS->native StatusBar controls: watch the top strip react */}
        <View class="row">
          <View class="flex1">
            <ActionButton
              title={statusBarHidden() ? 'Show status bar' : 'Hide status bar'}
              onPress={() => setStatusBarHidden(value => !value)}
              color={LINE_COLOR.primitives}
            />
          </View>
          <View class="flex1">
            <ActionButton
              title={darkStatusBar() ? 'Light text' : 'Dark text'}
              onPress={() => setDarkStatusBar(value => !value)}
              color={LINE_COLOR.primitives}
            />
          </View>
        </View>
        {/* Android-only window flags: the blank-risk pair. PASS: the top strip turns red / goes
            translucent and the app STAYS rendered. FAIL: the surface blanks (white screen); watch
            logcat for stopSurface / "reactInstance is null". Platform.OS never changes, so a plain
            && is right here — <Show> is for the reactive conditions. */}
        {Platform.OS === 'android' && (
          <View class="row">
            <View class="flex1">
              <ActionButton
                title={statusBarRed() ? 'BG default' : 'BG red'}
                onPress={() => {
                  const next = !statusBarRed();
                  setStatusBarRed(next);
                  StatusBar.setBackgroundColor(
                    next ? '#ff0000' : '#101a2c',
                    true,
                  );
                }}
                color={LINE_COLOR.primitives}
              />
            </View>
            <View class="flex1">
              <ActionButton
                title={statusBarTranslucent() ? 'Opaque' : 'Translucent'}
                onPress={() => {
                  const next = !statusBarTranslucent();
                  setStatusBarTranslucent(next);
                  StatusBar.setTranslucent(next);
                }}
                color={LINE_COLOR.primitives}
              />
            </View>
          </View>
        )}
        {/* JS->native imperative modules: tap to fire the real native UI / haptics. Each working
            button proves its module name resolved on the bridgeless host. */}
        <View class="row">
          <View class="flex1">
            <ActionButton
              title="Alert"
              onPress={onAlert}
              color={LINE_COLOR.primitives}
            />
          </View>
          {/* ActionSheetIOS drives the iOS-only ActionSheetManager; no Android native module
              exists, so the control is iOS-only by design (not a gap). */}
          {Platform.OS !== 'android' && (
            <View class="flex1">
              <ActionButton
                title="Action sheet"
                onPress={onActionSheet}
                color={LINE_COLOR.primitives}
              />
            </View>
          )}
        </View>
        <View class="row">
          <View class="flex1">
            <ActionButton
              title="Share"
              onPress={onShare}
              color={LINE_COLOR.primitives}
            />
          </View>
          <View class="flex1">
            <ActionButton
              title="Vibrate"
              onPress={() => Vibration.vibrate()}
              color={LINE_COLOR.primitives}
            />
          </View>
        </View>
        <ActionButton
          title="Open solidjs.com"
          onPress={onOpenUrl}
          color={LINE_COLOR.primitives}
        />

        {/* The native UIRefreshControl spinner only shows while iOS holds the scroll view
            pulled-down; our full re-commit snaps the offset back, so we drive our OWN indicator
            from the same `refreshing` flag, guaranteed visible. */}
        <Show
          when={refreshing()}
          fallback={
            <Text class="muted-center">
              {`pull to refresh · refreshed ${refreshes()}×`}
            </Text>
          }
        >
          <View class="refresh-row">
            <ActivityIndicator color={LINE_COLOR.primitives} />
            <Text class="accent-note">Refreshing…</Text>
          </View>
        </Show>

        {/* View + press-to-increment */}
        <View
          testID="counter-card"
          onPress={() => setCount(value => value + 1)}
          class="counter-card"
        >
          <Text testID="counter-value" class="counter-text">
            {`tapped ${count()}×`}
          </Text>
        </View>

        {/* TextInput + greeting. text-input is shared with the KAV email field below. */}
        <TextInput
          testID="greeting-input"
          value={name()}
          onValueChange={setName}
          placeholder="type your name…"
          placeholderTextColor="#7f8db3"
          class="text-input"
        />
        <Text testID="greeting-output" class="greeting">
          {name() ? `Hello, ${name()}` : 'Hello, stranger'}
        </Text>

        {/* Switch drives the ActivityIndicator */}
        <View class="switch-row">
          <Text class="switch-label">spinner</Text>
          <Switch
            testID="spinner-switch"
            value={spinning()}
            onValueChange={setSpinning}
            trackColor={{ false: '#334155', true: LINE_COLOR.primitives }}
          />
        </View>
        <ActivityIndicator
          testID="spinner-indicator"
          animating={spinning()}
          color={LINE_COLOR.primitives}
          size="large"
        />

        {/* Slider: a THIRD-PARTY native view (@react-native-community/slider) driven via the
            @symbiote-native/slider native-proxy wrapper. The engine derives the onValueChange event
            and the track/thumb tint processors from the library's own ViewConfig at runtime. Drag
            it: the value updates live; the colored track proves color derivation. */}
        <View class="section-tight">
          <Text class="switch-label">
            {`volume · ${Math.round(volume() * 100)}%`}
          </Text>
          <Slider
            value={volume()}
            onValueChange={setVolume}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            minimumTrackTintColor={LINE_COLOR.primitives}
            maximumTrackTintColor="#334155"
            thumbTintColor="#ffffff"
            class="slider"
          />
        </View>

        {/* Animated: JS driver vs native driver, side by side */}
        <AnimatedDemo />

        {/* Animated: ValueXY, tracking, diffClamp */}
        <AnimatedParityDemo />

        {/* Runtime modules: I18nManager, Settings, Image statics */}
        <NativeModulesDemo />

        {/* Imperative host-ref API: measure / setNativeProps / findNodeHandle */}
        <RefApiDemo />

        {/* PlatformColor / DynamicColorIOS: native semantic + appearance-aware colors */}
        <PlatformColorDemo />

        {/* Accessibility: a11y props to native, aria/role transform, AccessibilityInfo */}
        <AccessibilityDemo />

        {/* Responder: drag-vs-tap + mid-gesture transfer (move-should-set / takeover) */}
        <ResponderDemo />

        {/* Compound class rule: `.badge.loud` layers over `.badge`, static and dynamic */}
        <CompoundClassDemo />

        {/* Parity checks: longPress · Keyboard.dismiss · animated scroll · sticky · a11y focus */}
        <ParityDemo />

        {/* Opens a Modal */}
        <ActionButton
          testID="modal-open"
          title="Open modal"
          onPress={() => setModalVisible(true)}
          color={LINE_COLOR.primitives}
        />

        {/* Pressable's static look lives in .pressable-card; only the press-state-dependent colors
            stay a style function. The child takes an ACCESSOR and is called untracked (§4), so both
            state() reads sit inside the JSX where the compiler keeps them reactive. */}
        <Pressable
          onPress={() => setCount(value => value + 1)}
          class="pressable-card"
          style={state => ({
            backgroundColor: state.pressed ? '#0b1020' : '#151c33',
            borderColor: LINE_COLOR.primitives,
          })}
        >
          {state => (
            <Text
              class="pressable-label"
              style={{
                color: state().pressed ? LINE_COLOR.primitives : '#9aa6c4',
              }}
            >
              {state().pressed ? 'holding…' : 'press me (also +1)'}
            </Text>
          )}
        </Pressable>

        {/* Horizontal FlatList: real windowing. */}
        <Text class="section-label">FlatList · 24 chips, windowed</Text>
        <FlatList<IChip>
          testID="chips-list"
          data={CHIPS}
          horizontal
          keyExtractor={item => item.id}
          getItemLayout={(_data, index) => ({
            length: CHIP_WIDTH + CHIP_GAP,
            offset: (CHIP_WIDTH + CHIP_GAP) * index,
            index,
          })}
          class="chip-list"
          renderItem={info => (
            // width/marginRight stay dynamic — they reference the CHIP_WIDTH/CHIP_GAP script
            // consts (also used by getItemLayout above), which a CSS selector has no way to read;
            // backgroundColor is per-chip (item.color).
            <View
              class="chip-card"
              style={{
                width: CHIP_WIDTH,
                marginRight: CHIP_GAP,
                backgroundColor: info().item.color,
              }}
            >
              <Text class="chip-number">{info().item.index}</Text>
            </View>
          )}
        />

        {/* ===== feature-parity device checks ===== */}

        {/* Press-retention measured rect. PASS: press, then drag DOWN ~100px: the panel STAYS
            highlighted (inside the measured rect + 80px bottom retention). Drag UP off the top:
            highlight drops. Proves measured-rect retention rather than a symmetric-radius
            approximation. The dx/dy readout tracks the move offset. */}
        <Pressable
          hitSlop={{ top: 0, bottom: 40, left: 0, right: 0 }}
          pressRetentionOffset={{ top: 0, bottom: 80, left: 0, right: 0 }}
          onPressMove={event =>
            setRetentionMove({
              dx: Math.round(nativeNumber(event, 'locationX')),
              dy: Math.round(nativeNumber(event, 'locationY')),
            })
          }
          class="retention-card"
          style={state => ({
            backgroundColor: state.pressed ? LINE_COLOR.primitives : '#151c33',
          })}
        >
          {() => (
            <Text class="info-text">
              {`drag me · dx ${retentionMove.dx} · dy ${retentionMove.dy}`}
            </Text>
          )}
        </Pressable>

        {/* maintainVisibleContentPosition. PASS: scroll down a bit, tap Prepend: the rows you are
            looking at DO NOT jump; new items appear above without shifting the viewport. FAIL: the
            list jumps to the top. box-list160 is shared with the Animated.ScrollView below. */}
        <Text class="section-label">MVCP · prepend without jump</Text>
        <FlatList<IMvcpRow>
          data={mvcpItems()}
          keyExtractor={item => item.id}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          class="box-list160"
          // This list measures its own cells (no getItemLayout), and the divider is CHROME the list
          // renders BETWEEN them — so it belongs to the distance from one row to the next, not to
          // either row's height. That is the case the offset table has to get right; a model built
          // by summing heights alone is short by every divider it skipped, and the content below a
          // windowed-out region slides up and back as the window moves (core/components
          // buildOffsets). Deliberately on the MVCP list: prepend-without-jump is exactly where an
          // offset being off by a few points is visible.
          ItemSeparatorComponent={MvcpDivider}
          renderItem={info => (
            <View class="mvcp-row">
              <Text class="list-row-text">{info().item.label}</Text>
            </View>
          )}
        />
        <ActionButton
          title="Prepend 5"
          color={LINE_COLOR.primitives}
          onPress={prependRows}
        />

        {/* Animated.ScrollView scroll-driven header (native driver). PASS: drag INSIDE the box
            below (not the page): the bright bar above SMOOTHLY fades to near-invisible and lifts,
            on the UI thread (no jank, no per-frame JS). Proves Animated.ScrollView +
            Animated.event native attach. */}
        <Animated.View
          class="parity-header"
          style={{
            opacity: parityScrollY.interpolate({
              inputRange: [0, 120],
              outputRange: [1, 0.12],
              extrapolate: 'clamp',
            }),
            transform: [
              {
                translateY: parityScrollY.interpolate({
                  inputRange: [0, 120],
                  outputRange: [0, -16],
                  extrapolate: 'clamp',
                }),
              },
            ],
          }}
        >
          <Text class="parity-header-text">HEADER — fades as you scroll ↓</Text>
        </Animated.View>
        {/* box-list160 is shared with the MVCP FlatList above. */}
        <Animated.ScrollView
          class="box-list160"
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: parityScrollY } } }],
            { useNativeDriver: true },
          )}
        >
          <For each={SCROLL_ROWS}>
            {index => (
              <View class="scroll-demo-row">
                <Text class="list-row-text">{`scroll me · row ${index}`}</Text>
              </View>
            )}
          </For>
        </Animated.ScrollView>
        <Text class="tiny-center">
          ↑ drag inside the box — the bar above reacts
        </Text>
        {/* Native-driver proof for Animated.event: tap to JAM the JS thread 3s, then drag the box
            above DURING the freeze. If the bar keeps fading/lifting while JS is frozen, the scroll
            event drives parityScrollY on the UI thread (native attach). If it sticks until the
            thread frees, it was JS-driven. */}
        <ActionButton
          title="Freeze JS 3s — then scroll the box ↑"
          color="#fc8181"
          onPress={() => {
            const until = Date.now() + FREEZE_MS;
            while (Date.now() < until) {
              // Intentionally block the JS thread: no JS frame can run here, so any header motion
              // during the freeze must be coming from the native driver.
            }
          }}
        />
        <Text class="tiny-center">
          tap Freeze, then immediately drag the box — bar should still move
        </Text>

        {/* Modern style props reaching Fabric's C++ parser. Each is an A/B so the effect is
            unmistakable on the dark theme. Kept as inline dynamic style here (not CSS) only because
            these particular demos predate @symbiote-native/css-parser's `raw` passthrough for
            transform/box-shadow/filter/transform-origin — the CSS property itself now works
            identically (see .gradient-card below, which IS authored via CSS) — this is just legacy
            demo wiring, not a remaining gap. */}
        {/* boxShadow: a BLUE glow (a black shadow is invisible on the near-black bg). PASS: a soft
            blue halo bleeds out around the panel. */}
        <View
          class="shadow-card"
          style={{ boxShadow: '0px 0px 22px 3px rgba(118,179,225,0.85)' }}
        >
          <Text class="note-text">boxShadow · glow</Text>
        </View>
        {/* filter: same base colour both sides; the right one is darkened by brightness(0.5).
            PASS: the right panel is clearly darker than the left. */}
        <View class="row">
          <View class="filter-tile">
            <Text class="tile-text">no filter</Text>
          </View>
          <View class="filter-tile" style={{ filter: [{ brightness: 0.5 }] }}>
            <Text class="tile-text">brightness 0.5</Text>
          </View>
        </View>
        {/* transformOrigin: the panel rotates around its TOP-LEFT corner, not its centre. PASS: the
            left edge stays put while the bottom-right swings down. */}
        <View
          class="rotated-card"
          style={{
            transformOrigin: 'top left',
            transform: [{ rotate: '4deg' }],
          }}
        >
          <Text class="tile-text">transformOrigin · top-left</Text>
        </View>

        {/* background-image: a CSS `linear-gradient(...)` authored entirely in CanaryScreen.css
            (.gradient-card), proving @symbiote-native/css-parser's `background-image` → RN's
            `experimental_backgroundImage` raw passthrough works end to end (css-parser →
            registerRules → routeProp → core/engine/src/process-background-image → Fabric).
            PASS: the panel shows a blue-to-blue gradient sweeping left to right. */}
        <View class="gradient-card">
          <Text class="tile-text">background-image · linear-gradient</Text>
        </View>

        {/* Image web aliases. PASS: the logo loads via the web-alias fold (src→source uri,
            width/height→style); a screen reader reads "Solid logo" (alt→accessibilityLabel). */}
        <Image
          src="https://www.solidjs.com/img/logo/without-wordmark/logo.png"
          alt="Solid logo"
          width={48}
          height={48}
          class="web-image"
        />

        {/* KeyboardAvoidingView enabled toggle. PASS: with enabled ON, focusing the field lifts it
            above the keyboard AND the keyboard is the email layout (proves autoComplete/inputMode
            fold); with enabled OFF the keyboard covers the field. */}
        <View class="switch-row">
          <Text class="switch-label">avoid keyboard</Text>
          <Switch
            value={kavEnabled()}
            onValueChange={setKavEnabled}
            trackColor={{ false: '#334155', true: '#2b6cb0' }}
          />
        </View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          enabled={kavEnabled()}
        >
          <TextInput
            autoComplete="email"
            inputMode="email"
            enterKeyHint="done"
            placeholder="email — focus me near the bottom…"
            placeholderTextColor="#7f8db3"
            class="text-input"
          />
        </KeyboardAvoidingView>

        <Image
          source={{
            uri: 'https://www.solidjs.com/img/logo/without-wordmark/logo.png',
          }}
          class="logo-image"
        />

        <View class="bottom-card">
          <Text class="bottom-text">↑ you scrolled to the bottom</Text>
        </View>

        {/* Modal overlays its own window */}
        <Modal
          visible={modalVisible()}
          transparent
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}
        >
          {/* transparent modal => paint our own dim layer (the RN pattern) */}
          <View class="modal-overlay">
            <View testID="modal-card" class="modal-card">
              <Text class="modal-title">It's a Modal</Text>
              <Text class="modal-body">
                Rendered through ModalHostView — its own native window, same
                Fabric tree.
              </Text>
              <ActionButton
                testID="modal-close"
                title="Close"
                onPress={() => setModalVisible(false)}
                color={LINE_COLOR.primitives}
              />
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}
