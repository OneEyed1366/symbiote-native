<!--
  The Vue canary, as a multi-file SFC — now the "Primitives" tour stop of the
  @symbiote-native/navigation demo suite (route ROUTE_NAME.Canary), reached by pushing from
  MenuScreen.vue; it used to BE the app's whole root (App.vue), moved one level deeper into the
  nav tree without losing any of its own behavior — see the `symbiote-dev-examples` /
  `<examples_vs_dot_examples>` port note in the navigation-lines.ts/App.css headers for why.
  Metro compiles every .vue through metro-vue-transformer.js (parse → compileScript+
  inlineTemplate → 'vue'→@vue/runtime-core), so authoring is ordinary Vue — <template> +
  <script setup> — while every vnode still recommits through @symbiote-native/engine into
  Fabric, React Native's renderer never in the path.

  This is the FULL "all primitives" canary, the SFC twin of examples/vue-tsx/App.tsx and
  examples/react/screens/CanaryScreen.tsx: the root SafeAreaView → ScrollView composition lives
  here; the 8 demos (Animated, AnimatedParity, NativeModules, RefApi, PlatformColor, Accessibility,
  Responder, Parity) are each their own SFC under ../components, composed below in the same order
  as the TSX root. Same engine, same components, same palette (App.css's global registry — see
  below); the ONLY visual difference vs the React and TSX canaries is the "Primitives" line's
  brand color (Vue's green, LINE_COLOR.primitives).

  No local <style> block here on purpose: every class this screen references already lives in
  App.css's global registry, ported byte-identical from .examples/react/App.css (see that file's
  header) — a second, locally-scoped copy would only drift out of sync with it, which is exactly
  what happened before this screen was brought back to parity. Same pattern as
  DrawerHomeScreen.vue / StatePersistenceScreen.vue.

  Non-template constructs handled the SFC way: RefreshControl is element-valued, so it is built in
  script via a computed h() and bound (:refresh-control); Animated.View / Animated.ScrollView
  are used as dotted tags, which the SFC compiler resolves off the setup binding; FlatList renders its cell
  through the #item scoped slot; a `pressable` CHILD that needs the press state gets it from a
  local ref the screen keeps in step with @press-in/@press-out — press state lives on the engine
  node and never crosses back into Vue's reactivity.
-->
<script setup lang="ts">
import { ref, shallowRef, computed, h, onMounted, onUnmounted } from 'vue';
import {
  Animated,
  ScrollView,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  StatusBar,
  Keyboard,
  KEYBOARD_EVENT,
  Platform,
  StyleSheet,
  PixelRatio,
  useWindowDimensions,
  useColorScheme,
  AppState,
  Alert,
  ActionSheetIOS,
  Linking,
  Vibration,
  Share,
  createTunnel,
  type ISymbioteEvent,
  type IHostInstance,
} from '@symbiote-native/vue';
// A third-party native view via symbiote's own wrapper (not the library's React component); the
// engine derives RNCSlider's events + tint processors from its ViewConfig. Same wrapper as React.
import { Slider } from '@symbiote-native/slider/vue';

import ActionButton from '../components/ActionButton.vue';
import AnimatedDemo from '../components/AnimatedDemo.vue';
import AnimatedParityDemo from '../components/AnimatedParityDemo.vue';
import NativeModulesDemo from '../components/NativeModulesDemo.vue';
import RefApiDemo from '../components/RefApiDemo.vue';
import PlatformColorDemo from '../components/PlatformColorDemo.vue';
import AccessibilityDemo from '../components/AccessibilityDemo.vue';
import ResponderDemo from '../components/ResponderDemo.vue';
import CompoundClassDemo from '../components/CompoundClassDemo.vue';
import ParityDemo from '../components/ParityDemo.vue';
import { nativeNumber } from '../components/event-utils';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const CHIP_WIDTH = 72;
const CHIP_GAP = 12;
const REFRESH_MS = 2000;

const chips = Array.from({ length: 24 }, (_unused, index) => ({
  id: `chip-${index}`,
  index,
  color: `hsl(${(index * 37) % 360} 70% 55%)`,
}));

// A module-level singleton (not created inside setup) — the whole point of createTunnel is
// that its In/Out don't need to share a component instance, only this store. Destructured to
// PascalCase so the SFC compiler auto-registers them as usable template tags.
const overlayTunnel = createTunnel();
const { In: TunnelIn, Out: TunnelOut } = overlayTunnel;

// This screen's own "you are here" wayfinding pill, the same one every other tour stop carries
// (see MenuScreen.vue's ROUTE_LINE_INFO badges) — the one addition vs. the pre-navigation canary,
// everything else below is the relocated content unchanged.
const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Canary];

const count = ref(0);
const name = ref('');
const spinning = ref(true);
const volume = ref(0.5);
const modalVisible = ref(false);
const toastVisible = ref(false);
const tunnelToastVisible = ref(false);
// shallowRef, NOT ref: the engine node must be held by IDENTITY so Teleport's `to` target
// stays the real host node, not wrapped in a reactive Proxy (vue-adapter-reactivity Gotcha 1).
const overlayHost = shallowRef<IHostInstance | null>(null);
const refreshing = ref(false);
const refreshes = ref(0);
const keyboardHeight = ref(0);
const statusBarHidden = ref(false);
const darkStatusBar = ref(false);
// #6 Android-only StatusBar window flags: the blank-risk pair (device-verify-pending).
const statusBarRed = ref(false);
const statusBarTranslucent = ref(false);

// Feature-parity device checks: state for the cluster before the final logo.
const retentionMove = ref({ dx: 0, dy: 0 });
const mvcpItems = ref(
  Array.from({ length: 20 }, (_value, index) => ({
    id: `row-${index}`,
    label: `item ${index}`,
  })),
);
let mvcpHead = 0;
// native-driver scroll value: Animated.event attaches it on the UI thread, so the
// header opacity/translateY are driven without a JS frame per scroll tick.
const parityScrollY = new Animated.Value(0);
const parityHeaderOpacity = parityScrollY.interpolate({
  inputRange: [0, 120],
  outputRange: [1, 0.12],
  extrapolate: 'clamp',
});
const parityHeaderTranslateY = parityScrollY.interpolate({
  inputRange: [0, 120],
  outputRange: [0, -16],
  extrapolate: 'clamp',
});
const onParityScroll = Animated.event(
  [{ nativeEvent: { contentOffset: { y: parityScrollY } } }],
  { useNativeDriver: true },
);
const kavEnabled = ref(true);

// 0..5, so the keyed v-for matches the TSX's index-keyed Array.from(length: 6).
const scrollRows = Array.from({ length: 6 }, (_value, index) => index);

// Tier B runtime modules, read live: the composables pull from Dimensions/Appearance,
// appState tracks foreground/background through AppState's device events.
const window = useWindowDimensions();
const colorScheme = useColorScheme();
const appState = ref<string>(AppState.currentState ?? 'unknown');

// Native launch screen: hide() now lives once at the root (App.vue's own onMounted), not here —
// this screen isn't the first thing mounted anymore (Menu is the initial route), so hiding it
// from here would be too late (or, once a user navigates back to Canary a second time, wrong).

// native -> JS: the device hub pushes keyboard frames; we read the height live.
let keyboardSubs: Array<{ remove(): void }> = [];
onMounted(() => {
  const onShow = (payload: unknown): void => {
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
    keyboardHeight.value = height;
  };
  keyboardSubs = [
    Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
    Keyboard.addListener(KEYBOARD_EVENT.didHide, () => {
      keyboardHeight.value = 0;
    }),
  ];
});
onUnmounted(() => keyboardSubs.forEach(subscription => subscription.remove()));

// native -> JS: AppState pushes lifecycle changes; read the current phase live.
let appStateSub: { remove(): void } | undefined;
onMounted(() => {
  appStateSub = AppState.addEventListener('change', (...args: unknown[]) => {
    const next = args[0];
    if (typeof next === 'string') appState.value = next;
  });
});
onUnmounted(() => appStateSub?.remove());

const onRefresh = (): void => {
  refreshing.value = true;
  setTimeout(() => {
    refreshing.value = false;
    refreshes.value += 1;
  }, REFRESH_MS);
};

// The RefreshControl as an element-valued prop — Vue templates can't inline an element into a
// prop, so build the VNode in script and bind it; recomputes when `refreshing` flips.
const refreshControl = computed(() =>
  h('refresh-control', {
    refreshing: refreshing.value,
    onRefresh,
    tintColor: LINE_COLOR.primitives,
  }),
);

// Tier A runtime modules, read live. A non-empty Version proves PlatformConstants resolved; a
// fractional hairline (e.g. 0.333 on @3x) proves DeviceInfo's scale resolved.
const hairlineText = computed(
  () =>
    `${Platform.OS} ${Platform.Version}` +
    `${Platform.isPad ? ' · iPad' : ''}` +
    ` · ${Platform.select({ ios: 'native ios', android: 'native android', default: '?' })}` +
    ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`,
);
// Real w×h@scale proves Dimensions + PixelRatio; a colorScheme proves Appearance; appState flips
// when you background the app (AppState's device events).
const dimensionsText = computed(
  () =>
    `${Math.round(window.value.width)}×${Math.round(window.value.height)} @${PixelRatio.get()}x` +
    ` · ${colorScheme.value ?? 'no-scheme'} · ${appState.value}`,
);

// JS->native StatusBar window flags (Android). setBackgroundColor/setTranslucent imperative drives.
const onToggleStatusBarRed = (): void => {
  const next = !statusBarRed.value;
  statusBarRed.value = next;
  StatusBar.setBackgroundColor(next ? '#ff0000' : '#101a2c', true);
};
const onToggleStatusBarTranslucent = (): void => {
  const next = !statusBarTranslucent.value;
  statusBarTranslucent.value = next;
  StatusBar.setTranslucent(next);
};

// JS -> native imperative modules. A Promise reject (no native module / user
// cancel) is expected, so it's swallowed; this is a demo, not a flow to handle.
const onShare = (): void => {
  void Share.share({
    message: 'Sent from symbiote',
    url: 'https://vuejs.org',
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
  void Linking.openURL('https://vuejs.org').catch(() => {});
};

const onRetentionMove = (event: ISymbioteEvent): void => {
  retentionMove.value = {
    dx: Math.round(nativeNumber(event, 'locationX')),
    dy: Math.round(nativeNumber(event, 'locationY')),
  };
};

// Horizontal FlatList: real windowing over 24 chips. The cell is the #item scoped slot.
const chipsKeyExtractor = (item: {
  id: string;
  index: number;
  color: string;
}): string => item.id;
const chipsGetItemLayout = (
  _data: unknown,
  index: number,
): { length: number; offset: number; index: number } => ({
  length: CHIP_WIDTH + CHIP_GAP,
  offset: (CHIP_WIDTH + CHIP_GAP) * index,
  index,
});

// maintainVisibleContentPosition list: prepend without jump.
const mvcpKeyExtractor = (item: { id: string; label: string }): string =>
  item.id;
const onPrepend = (): void => {
  mvcpHead -= 5;
  const head = mvcpHead;
  const prepended = Array.from({ length: 5 }, (_value, index) => {
    const n = head + index;
    return { id: `row-${n}`, label: `item ${n}` };
  });
  mvcpItems.value = [...prepended, ...mvcpItems.value];
};

// Native-driver proof for Animated.event: JAM the JS thread 3s, then drag the box during the
// freeze. If the bar keeps fading/lifting while JS is frozen, the scroll drives parityScrollY on
// the UI thread (native attach); if it sticks until the thread frees, it was JS-driven.
const freezeJs3s = (): void => {
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    // Intentionally block the JS thread: no JS frame can run here, so any header motion during
    // the freeze must be coming from the native driver.
  }
};

// `style` as a FUNCTION of press state is RN's own idiom, and the engine resolves it on the bare
// tag (routeProp evaluates the callback at both values of `pressed`). The static look lives in
// .pressable-card / .retention-card (App.css's global registry).
const pressableStyle = ({ pressed }: { pressed: boolean }) => ({
  backgroundColor: pressed ? '#0b1622' : '#13243a',
  borderColor: LINE_COLOR.primitives,
});
// The element resolves its OWN style callback, but a CHILD has no channel to the press state —
// it lives on the engine node and never re-enters Vue's reactivity. So the screen mirrors it,
// which is what any app styling a descendant on press has to do.
const cardPressed = ref(false);
const retentionStyle = ({ pressed }: { pressed: boolean }) => ({
  backgroundColor: pressed ? LINE_COLOR.primitives : '#13243a',
});

// Modern style props reaching Fabric's C++ parser, kept as dynamic style objects here (not CSS)
// only because these demos predate @symbiote-native/css-parser's `raw` passthrough for transform/
// box-shadow/filter/transform-origin (2026-07) — the CSS property itself now works identically
// (see .gradient-card below, authored via CSS) — legacy demo wiring, not a remaining gap.
const shadowCardExtra = {
  boxShadow: '0px 0px 22px 3px rgba(20,158,202,0.85)',
};
const dimStyle = { filter: [{ brightness: 0.5 }] };
const rotationStyle = {
  transformOrigin: 'top left',
  transform: [{ rotate: '4deg' }],
};
</script>

<template>
  <safe-area-view class="screen">
    <ScrollView
      testID="canary-scroll"
      class="screen"
      content-container-style="scroll-content"
      :refresh-control="refreshControl"
    >
      <!-- JS->native: StatusBar renders nothing; it drives the iOS status bar imperatively. -->
      <StatusBar
        :bar-style="darkStatusBar ? 'dark-content' : 'light-content'"
        :hidden="statusBarHidden"
        :animated="true"
      />
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view
          class="hero-badge"
          :style="{ backgroundColor: LINE_COLOR.primitives }"
        >
          <text class="hero-badge-text">CN</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">All primitives</text>
          <text class="hero-body"
            >Every @symbiote-native/vue primitive, driven straight onto Fabric —
            no react-native renderer in the path.</text
          >
        </view>
      </view>
      <!-- native->JS: keyboard height pushed from the device hub, read live -->
      <text class="header-note">{{
        keyboardHeight > 0
          ? `keyboard up · ${keyboardHeight}px`
          : 'keyboard down'
      }}</text>
      <!-- Tier A runtime modules, live. The border below IS the hairline. -->
      <text
        class="hairline-note"
        :style="{ borderTopWidth: StyleSheet.hairlineWidth }"
        >{{ hairlineText }}</text
      >
      <!-- Tier B runtime modules, live. -->
      <text class="header-note">{{ dimensionsText }}</text>

      <!-- JS->native StatusBar controls: watch the top strip react -->
      <view class="row">
        <view class="flex1">
          <ActionButton
            :title="statusBarHidden ? 'Show status bar' : 'Hide status bar'"
            :onPress="() => (statusBarHidden = !statusBarHidden)"
            :color="LINE_COLOR.primitives"
          />
        </view>
        <view class="flex1">
          <ActionButton
            :title="darkStatusBar ? 'Light text' : 'Dark text'"
            :onPress="() => (darkStatusBar = !darkStatusBar)"
            :color="LINE_COLOR.primitives"
          />
        </view>
      </view>
      <!-- #6 Android-only window flags: the blank-risk pair. PASS: the top strip turns
           red / goes translucent and the app STAYS rendered. -->
      <view v-if="Platform.OS === 'android'" class="row">
        <view class="flex1">
          <ActionButton
            :title="statusBarRed ? 'BG default' : 'BG red'"
            :onPress="onToggleStatusBarRed"
            :color="LINE_COLOR.primitives"
          />
        </view>
        <view class="flex1">
          <ActionButton
            :title="statusBarTranslucent ? 'Opaque' : 'Translucent'"
            :onPress="onToggleStatusBarTranslucent"
            :color="LINE_COLOR.primitives"
          />
        </view>
      </view>
      <!-- JS->native imperative modules: tap to fire the real native UI / haptics. -->
      <view class="row">
        <view class="flex1">
          <ActionButton
            title="Alert"
            :onPress="onAlert"
            :color="LINE_COLOR.primitives"
          />
        </view>
        <!-- ActionSheetIOS is iOS-only by design (no Android native module exists). -->
        <view v-if="Platform.OS !== 'android'" class="flex1">
          <ActionButton
            title="Action sheet"
            :onPress="onActionSheet"
            :color="LINE_COLOR.primitives"
          />
        </view>
      </view>
      <view class="row">
        <view class="flex1">
          <ActionButton
            title="Share"
            :onPress="onShare"
            :color="LINE_COLOR.primitives"
          />
        </view>
        <view class="flex1">
          <ActionButton
            title="Vibrate"
            :onPress="() => Vibration.vibrate()"
            :color="LINE_COLOR.primitives"
          />
        </view>
      </view>
      <ActionButton
        title="Open vuejs.org"
        :onPress="onOpenUrl"
        :color="LINE_COLOR.primitives"
      />

      <!-- The native UIRefreshControl spinner only shows while iOS holds the pull-down; our full
           re-commit snaps the offset back, so we drive our OWN indicator from `refreshing`. -->
      <view v-if="refreshing" class="refresh-row">
        <activity-indicator :color="LINE_COLOR.primitives" />
        <text class="accent-note">Refreshing…</text>
      </view>
      <text v-else class="muted-center">{{
        `pull to refresh · refreshed ${refreshes}×`
      }}</text>

      <!-- View + press-to-increment -->
      <view testID="counter-card" @press="count += 1" class="counter-card">
        <text testID="counter-value" class="counter-text">{{
          `tapped ${count}×`
        }}</text>
      </view>

      <!-- text-input + greeting, via v-model — on an element the compiler emits a runtime
           directive, which the adapter ships (runtime-helpers/vModelText) -->
      <text-input
        testID="greeting-input"
        v-model="name"
        placeholder="type your name…"
        placeholder-text-color="#41506a"
        class="text-input"
      />
      <text testID="greeting-output" class="greeting">{{
        name ? `Hello, ${name}` : 'Hello, stranger'
      }}</text>

      <!-- Switch drives the ActivityIndicator, via v-model -->
      <view class="switch-row">
        <text class="switch-label">spinner</text>
        <switch
          testID="spinner-switch"
          v-model="spinning"
          :track-color="{ false: '#334155', true: LINE_COLOR.primitives }"
        />
      </view>
      <activity-indicator
        testID="spinner-indicator"
        :animating="spinning"
        :color="LINE_COLOR.primitives"
        size="large"
      />

      <!-- Slider: the @react-native-community/slider native view via @symbiote-native/slider/vue. The
           engine derives its events + tint processors from the library's ViewConfig; same wrapper
           backs the React canary. -->
      <view class="section-tight">
        <text class="switch-label">{{
          `volume · ${Math.round(volume * 100)}%`
        }}</text>
        <Slider
          v-model="volume"
          :minimum-value="0"
          :maximum-value="1"
          :step="0.01"
          :minimum-track-tint-color="LINE_COLOR.primitives"
          maximum-track-tint-color="#334155"
          thumb-tint-color="#ffffff"
          class="slider"
        />
      </view>

      <!-- Animated: JS driver vs native driver, side by side -->
      <AnimatedDemo />

      <!-- Animated: ValueXY, tracking, diffClamp -->
      <AnimatedParityDemo />

      <!-- Runtime modules: I18nManager, Settings, Image statics -->
      <NativeModulesDemo />

      <!-- Imperative host-ref API: measure / setNativeProps / findNodeHandle -->
      <RefApiDemo />

      <!-- PlatformColor / DynamicColorIOS: native semantic + appearance-aware colors -->
      <PlatformColorDemo />

      <!-- Accessibility: a11y props to native, aria/role transform, AccessibilityInfo -->
      <AccessibilityDemo />

      <!-- Responder: drag-vs-tap + mid-gesture transfer (move-should-set / takeover) -->
      <ResponderDemo />

      <!-- Component-local style block: compound selector, static and dynamic class -->
      <CompoundClassDemo />

      <!-- Parity checks: longPress · Keyboard.dismiss · animated scroll · sticky · a11y focus -->
      <ParityDemo />

      <!-- Opens a Modal -->
      <ActionButton
        testID="modal-open"
        title="Open modal"
        :onPress="() => (modalVisible = true)"
        :color="LINE_COLOR.primitives"
      />

      <!-- The static look lives in .pressable-card; only the press-state-dependent colors stay a
           style function, which the tag resolves itself at both values of `pressed`. A CHILD has
           no such channel, so the screen mirrors the state into `cardPressed`. -->
      <pressable
        @press="count += 1"
        @press-in="cardPressed = true"
        @press-out="cardPressed = false"
        class="pressable-card"
        :style="pressableStyle"
      >
        <text
          class="pressable-label"
          :style="{ color: cardPressed ? LINE_COLOR.primitives : '#cbd5e1' }"
          >{{ cardPressed ? 'holding…' : 'press me (also +1)' }}</text
        >
      </pressable>

      <!-- Horizontal FlatList: real windowing. -->
      <text class="section-label">FlatList · 24 chips, windowed</text>
      <FlatList
        testID="chips-list"
        :data="chips"
        :horizontal="true"
        :key-extractor="chipsKeyExtractor"
        :get-item-layout="chipsGetItemLayout"
        class="chip-list"
      >
        <template #item="{ item }">
          <!-- width/marginRight stay dynamic — they reference the CHIP_WIDTH/CHIP_GAP script
               consts (also used by chipsGetItemLayout above), which a CSS selector has no way to
               read; backgroundColor is per-chip (item.color). -->
          <view
            class="chip-card"
            :style="{
              width: CHIP_WIDTH,
              marginRight: CHIP_GAP,
              backgroundColor: item.color,
            }"
          >
            <text class="chip-number">{{ item.index }}</text>
          </view>
        </template>
      </FlatList>

      <!-- ===== feature-parity device checks ===== -->

      <!-- Press-retention measured rect. PASS: press, then drag DOWN ~100px: the panel
           STAYS highlighted (inside the measured rect + 80px bottom retention). Drag UP
           off the top: highlight drops. Proves measured-rect retention rather than a
           symmetric-radius approximation. The dx/dy readout tracks the move offset. -->
      <!-- Pressable's static look lives in .retention-card; only the press-state-dependent
           background stays a style function. -->
      <pressable
        :hit-slop="{ top: 0, bottom: 40, left: 0, right: 0 }"
        :press-retention-offset="{ top: 0, bottom: 80, left: 0, right: 0 }"
        @press-move="onRetentionMove"
        class="retention-card"
        :style="retentionStyle"
      >
        <text class="info-text">{{
          `drag me · dx ${retentionMove.dx} · dy ${retentionMove.dy}`
        }}</text>
      </pressable>

      <!-- maintainVisibleContentPosition. PASS: scroll down a bit, tap Prepend: the rows
           you are looking at DO NOT jump; new items appear above without shifting the
           viewport. FAIL: the list jumps to the top. box-list160 is shared with the
           Animated.ScrollView below. -->
      <text class="section-label">MVCP · prepend without jump</text>
      <FlatList
        :data="mvcpItems"
        :key-extractor="mvcpKeyExtractor"
        :maintain-visible-content-position="{ minIndexForVisible: 0 }"
        class="box-list160"
      >
        <template #item="{ item }">
          <view class="mvcp-row">
            <text class="list-row-text">{{ item.label }}</text>
          </view>
        </template>
        <!-- This list measures its own cells (no getItemLayout), and the divider is CHROME the
             list renders BETWEEN them — so it belongs to the distance from one row to the next,
             not to either row's height. That is the case the offset table has to get right; a
             model built by summing heights alone is short by every divider it skipped, and the
             content below a windowed-out region slides up and back as the window moves
             (core/components buildOffsets). Deliberately on the MVCP list: prepend-without-jump
             is exactly where an offset being off by a few points is visible. -->
        <template #separator>
          <view class="mvcp-divider" />
        </template>
      </FlatList>
      <ActionButton
        title="Prepend 5"
        :color="LINE_COLOR.primitives"
        :onPress="onPrepend"
      />

      <!-- Animated.ScrollView scroll-driven header (native driver). PASS: drag INSIDE the
           box below (not the page): the bright bar above SMOOTHLY fades to near-invisible
           and lifts, on the UI thread (no jank, no per-frame JS). Proves Animated.ScrollView
           + Animated.event native attach. -->
      <Animated.View
        class="parity-header"
        :style="{
          opacity: parityHeaderOpacity,
          transform: [{ translateY: parityHeaderTranslateY }],
        }"
      >
        <text class="parity-header-text">HEADER — fades as you scroll ↓</text>
      </Animated.View>
      <!-- box-list160 is shared with the MVCP FlatList above. -->
      <Animated.ScrollView
        class="box-list160"
        :scroll-event-throttle="16"
        @scroll="onParityScroll"
      >
        <view v-for="i in scrollRows" :key="i" class="scroll-demo-row">
          <text class="list-row-text">{{ `scroll me · row ${i}` }}</text>
        </view>
      </Animated.ScrollView>
      <text class="tiny-center"
        >↑ drag inside the box — the bar above reacts</text
      >
      <!-- Native-driver proof for Animated.event: tap to JAM the JS thread 3s, then drag
           the box above DURING the freeze. If the bar keeps fading/lifting while JS is
           frozen, the scroll event drives parityScrollY on the UI thread (native attach).
           If it sticks until the thread frees, it was JS-driven. -->
      <ActionButton
        title="Freeze JS 3s — then scroll the box ↑"
        color="#fc8181"
        :onPress="freezeJs3s"
      />
      <text class="tiny-center"
        >tap Freeze, then immediately drag the box — bar should still move</text
      >

      <!-- Modern style props reaching Fabric's C++ parser. Each is an A/B so the effect
           is unmistakable on the dark theme. -->
      <!-- boxShadow: a BLUE glow (a black shadow is invisible on the near-black bg).
           PASS: a soft blue halo bleeds out around the panel. -->
      <view class="shadow-card" :style="shadowCardExtra">
        <text class="note-text">boxShadow · glow</text>
      </view>
      <!-- filter: same base colour both sides; the right one is darkened by
           brightness(0.5). PASS: the right panel is clearly darker than the left. -->
      <view class="row">
        <view class="filter-tile">
          <text class="tile-text">no filter</text>
        </view>
        <view class="filter-tile" :style="dimStyle">
          <text class="tile-text">brightness 0.5</text>
        </view>
      </view>
      <!-- transformOrigin: the panel rotates around its TOP-LEFT corner, not its centre.
           PASS: the left edge stays put while the bottom-right swings down. -->
      <view class="rotated-card" :style="rotationStyle">
        <text class="tile-text">transformOrigin · top-left</text>
      </view>

      <!-- background-image: a CSS `linear-gradient(...)` authored entirely in App.css
           (.gradient-card), proving @symbiote-native/css-parser's `background-image` → RN's
           `experimental_backgroundImage` raw passthrough works end to end. PASS: the panel
           shows a blue-to-orange gradient sweeping left to right. -->
      <view class="gradient-card">
        <text class="tile-text">background-image · linear-gradient</text>
      </view>

      <!-- Image web aliases. PASS: the logo loads via the web-alias fold (src→source uri,
           width/height→style); a screen reader reads "Vue logo" (alt→accessibilityLabel). -->
      <image
        src="https://vuejs.org/images/logo.png"
        alt="Vue logo"
        :width="48"
        :height="48"
        class="web-image"
      />

      <!-- KeyboardAvoidingView enabled toggle. PASS: with enabled ON, focusing the field
           lifts it above the keyboard AND the keyboard is the email layout (proves
           autoComplete/inputMode fold); with enabled OFF the keyboard covers the field. -->
      <view class="switch-row">
        <text class="switch-label">avoid keyboard</text>
        <switch
          v-model="kavEnabled"
          :track-color="{ false: '#334155', true: '#42b883' }"
        />
      </view>
      <KeyboardAvoidingView
        :behavior="Platform.OS === 'ios' ? 'padding' : 'height'"
        :enabled="kavEnabled"
      >
        <text-input
          auto-complete="email"
          input-mode="email"
          enter-key-hint="done"
          placeholder="email — focus me near the bottom…"
          placeholder-text-color="#41506a"
          class="text-input"
        />
      </KeyboardAvoidingView>

      <image
        :source="{ uri: 'https://vuejs.org/images/logo.png' }"
        class="logo-image"
      />

      <view class="bottom-card">
        <text class="bottom-text">↑ you scrolled to the bottom</text>
      </view>

      <!-- Modal overlays its own window -->
      <Modal
        :visible="modalVisible"
        :transparent="true"
        animation-type="fade"
        @request-close="() => (modalVisible = false)"
      >
        <!-- transparent modal => paint our own dim layer (the RN pattern) -->
        <view class="modal-overlay">
          <view testID="modal-card" class="modal-card">
            <text class="modal-title">It's a Modal</text>
            <text class="modal-body"
              >Rendered through ModalHostView — its own native window, same
              Fabric tree.</text
            >
            <ActionButton
              testID="modal-close"
              title="Close"
              :onPress="() => (modalVisible = false)"
              :color="LINE_COLOR.primitives"
            />
          </view>
        </view>
      </Modal>

      <!-- Teleport: moves the toast card OUT of this scroll content and INTO the overlay-host
           View rendered as a sibling of ScrollView below — same surface, so it repaints on the
           ONE patch this tree already does. Our runtime-helpers shim validates `to` before
           delegating to the real Vue Teleport (vue-adapter-directives). -->
      <ActionButton
        testID="toast-open"
        title="Show toast (Teleport)"
        :onPress="() => (toastVisible = true)"
        :color="LINE_COLOR.primitives"
      />
      <Teleport v-if="overlayHost" :to="overlayHost">
        <view v-if="toastVisible" testID="toast-card" class="modal-card">
          <text class="modal-body">Ported via Teleport ✦</text>
          <ActionButton
            testID="toast-dismiss"
            title="Dismiss"
            :onPress="() => (toastVisible = false)"
            :color="LINE_COLOR.primitives"
          />
        </view>
      </Teleport>

      <!-- createTunnel: no ref, no target node — TunnelIn just registers its slot content from
           wherever it's mounted; TunnelOut (rendered in the overlay host below) reads it back
           through its OWN normal render, wherever that happens to be mounted, even a different
           surface. -->
      <ActionButton
        testID="tunnel-toast-open"
        title="Show toast (createTunnel)"
        :onPress="() => (tunnelToastVisible = true)"
        :color="LINE_COLOR.primitives"
      />
      <TunnelIn v-if="tunnelToastVisible">
        <view testID="tunnel-toast-card" class="modal-card">
          <text class="modal-body">Ported via createTunnel ✦</text>
          <ActionButton
            testID="tunnel-toast-dismiss"
            title="Dismiss"
            :onPress="() => (tunnelToastVisible = false)"
            :color="LINE_COLOR.primitives"
          />
        </view>
      </TunnelIn>
    </ScrollView>

    <!-- The Teleport/tunnel target: a persistent, empty View sitting above the scroll content.
         pointer-events="box-none" lets touches pass through everywhere except an actual ported
         child (the toast card). Rendered here — a sibling of ScrollView, same surface — so
         Teleport above can reach it via the template ref; createTunnel's TunnelOut below works
         identically wherever it's mounted. -->
    <view
      testID="overlay-host"
      ref="overlayHost"
      pointer-events="box-none"
      class="overlay-host"
    >
      <TunnelOut />
    </view>
  </safe-area-view>
</template>
