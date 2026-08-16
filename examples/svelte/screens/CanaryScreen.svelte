<script lang="ts">
  // The Svelte canary — a 1:1 port of examples/vue-sfc/screens/CanaryScreen.vue, themed in
  // Svelte's own brand colors. Every section, every PASS/FAIL device check and every prop of the
  // Vue screen is here; the palette is this example's own (App.css: --flame #ff3e00 from
  // github.com/sveltejs/branding, over the neutral dark --ink/--paper/--mist) instead of Vue's
  // green-on-navy, and the ONE external link points at svelte.com.
  //
  // The accent is read from navigation-lines.ts's LINE_COLOR — the same single source of truth the
  // Vue canary reads — never re-typed as a local hex, so the line tag, the buttons and the CSS
  // --line-primitives token can't drift apart.
  //
  // The root SafeAreaView -> ScrollView composition lives here; the 8 demos (Animated,
  // AnimatedParity, NativeModules, RefApi, PlatformColor, Accessibility, Responder, Parity) are
  // each their own .svelte file under ../components, composed below in the same order as the Vue
  // and TSX roots. App.svelte is a thin root: it imports App.css and calls the splash-screen
  // hide(), exactly like examples/vue-sfc/App.vue does.
  //
  // THREE constructs of the Vue/React sources have no Svelte port, for real architectural reasons
  // rather than omission:
  //  - Vue's <Teleport> toast: framework-specific. The Svelte adapter's cross-surface equivalent
  //    is createTunnel, which this screen already demos below — the Teleport twin would be a
  //    second button doing the same thing through machinery that does not exist here.
  //  - React's createPortal: react-reconciler's own Fiber-level HostPortal primitive. Neither
  //    Svelte nor Vue has a reconciler, so neither has an equivalent hook point.
  //  - Animated.FlatList / Animated.SectionList: not wrapped on this adapter yet (see
  //    modules/animated's own documented scope boundary) — the lists below stay non-animated,
  //    matching what is actually built. The Vue screen doesn't use them either.
  //
  // MARKUP FORMATTING IS LOAD-BEARING: every multi-sibling region is packed edge-to-edge with zero
  // whitespace between siblings — svelte-adapter-dom-shim skill §16 (a stray space between two
  // sibling tags compiles to a real RCTRawText child, invalid under a non-Text parent on device).
  // Verify with `node scripts/audit-svelte-stray-whitespace.mjs` after any edit.
  import {
    View,
    Text,
    ScrollView,
    TextInput,
    Image,
    Switch,
    ActivityIndicator,
    Pressable,
    Modal,
    FlatList,
    KeyboardAvoidingView,
    SafeAreaView,
    StatusBar,
    Keyboard,
    KEYBOARD_EVENT,
    Platform,
    StyleSheet,
    PixelRatio,
    Alert,
    ActionSheetIOS,
    Linking,
    Vibration,
    Share,
    AppState,
    Animated,
    createTunnel,
    TunnelIn,
    TunnelOut,
    useWindowDimensions,
    useColorScheme,
    type ISymbioteEvent,
  } from '@symbiote-native/svelte';
  // A third-party native view via symbiote's own wrapper (not the library's React component); the
  // engine derives RNCSlider's events + tint processors from its ViewConfig. Same wrapper as React.
  import { Slider } from '@symbiote-native/slider/svelte';

  import ActionButton from '../components/ActionButton.svelte';
  import AnimatedDemo from '../components/AnimatedDemo.svelte';
  import AnimatedParityDemo from '../components/AnimatedParityDemo.svelte';
  import NativeModulesDemo from '../components/NativeModulesDemo.svelte';
  import RefApiDemo from '../components/RefApiDemo.svelte';
  import PlatformColorDemo from '../components/PlatformColorDemo.svelte';
  import AccessibilityDemo from '../components/AccessibilityDemo.svelte';
  import ResponderDemo from '../components/ResponderDemo.svelte';
  import CompoundClassDemo from '../components/CompoundClassDemo.svelte';
  import ParityDemo from '../components/ParityDemo.svelte';
  import { nativeNumber } from '../components/event-utils';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, NAV_LINE, ROUTE_LINE_INFO } from '../navigation-lines';

  // Animated.View / Animated.ScrollView are dotted, so they can't be template tags — bound to a
  // local component value first, same as every other adapter's port of this screen.
  const AnimatedView = Animated.View;
  const AnimatedScrollView = Animated.ScrollView;

  const CHIP_WIDTH = 72;
  const CHIP_GAP = 12;
  const CHIP_COUNT = 24;
  const REFRESH_MS = 2_000;
  const FREEZE_MS = 3_000;
  const MVCP_ROW_COUNT = 20;
  const PREPEND_COUNT = 5;
  const SCROLL_ROW_COUNT = 6;
  // 16ms ~= one frame: the rate the native scroll view is allowed to emit onScroll at.
  const SCROLL_EVENT_THROTTLE_MS = 16;
  // The scroll distance over which the parity header fades out and lifts.
  const HEADER_FADE_DISTANCE = 120;
  const STATUS_BAR_RED = '#ff0000';
  const STATUS_BAR_DEFAULT = '#1a1a1a';
  const PLACEHOLDER_COLOR = '#6a6a6a';
  const SURFACE = '#262626';
  const SURFACE_PRESSED = '#0f0f0f';
  const HAIRLINE = '#3a3a3a';
  const CHALK = '#cbd5e1';
  // The Freeze button is deliberately off-palette: it is a diagnostic, not part of the tour.
  const WARN = '#fc8181';

  // Svelte's brand flame, read from the ONE place it is defined (navigation-lines.ts) rather than
  // re-typed here — the same indirection the Vue canary uses for its green.
  const accent = LINE_COLOR[NAV_LINE.Primitives];

  const chips = Array.from({ length: CHIP_COUNT }, (_unused, index) => ({
    id: `chip-${index}`,
    index,
    color: `hsl(${(index * 37) % 360} 70% 55%)`,
  }));

  // A module-level singleton would be equally correct; kept in the instance because this screen is
  // the only mount point. The point of createTunnel is that In/Out don't need to share a component
  // instance, only this store.
  const overlayTunnel = createTunnel();

  // This screen's own "you are here" wayfinding pill, the same one every other tour stop carries.
  // examples/svelte has no navigator yet, so this is the only consumer of routes.ts today.
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Canary];

  let count = $state(0);
  let name = $state('');
  let spinning = $state(true);
  let volume = $state(0.5);
  let modalVisible = $state(false);
  let tunnelToastVisible = $state(false);
  let refreshing = $state(false);
  let refreshes = $state(0);
  let keyboardHeight = $state(0);
  let statusBarHidden = $state(false);
  let darkStatusBar = $state(false);
  // Android-only StatusBar window flags: the blank-risk pair (device-verify-pending).
  let statusBarRed = $state(false);
  let statusBarTranslucent = $state(false);
  let kavEnabled = $state(true);

  // Feature-parity device checks: state for the cluster before the final logo.
  let retentionMove = $state({ dx: 0, dy: 0 });
  let mvcpItems = $state(
    Array.from({ length: MVCP_ROW_COUNT }, (_unused, index) => ({
      id: `row-${index}`,
      label: `item ${index}`,
    })),
  );
  let mvcpHead = 0;

  // native-driver scroll value: Animated.event attaches it on the UI thread, so the header
  // opacity/translateY are driven without a JS frame per scroll tick.
  const parityScrollY = new Animated.Value(0);
  const parityHeaderOpacity = parityScrollY.interpolate({
    inputRange: [0, HEADER_FADE_DISTANCE],
    outputRange: [1, 0.12],
    extrapolate: 'clamp',
  });
  const parityHeaderTranslateY = parityScrollY.interpolate({
    inputRange: [0, HEADER_FADE_DISTANCE],
    outputRange: [0, -16],
    extrapolate: 'clamp',
  });
  const onParityScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: parityScrollY } } }],
    { useNativeDriver: true },
  );

  // 0..5, so the keyed {#each} matches the TSX's index-keyed Array.from(length: 6).
  const scrollRows = Array.from({ length: SCROLL_ROW_COUNT }, (_unused, index) => index);

  // Tier B runtime modules, read live: the runes pull from Dimensions/Appearance, appState tracks
  // foreground/background through AppState's device events.
  const windowSize = useWindowDimensions();
  const colorScheme = useColorScheme();
  let appState = $state<string>(AppState.currentState ?? 'unknown');

  // Native launch screen: hide() lives once at the root (App.svelte), not here — the same split
  // examples/vue-sfc uses, so a future navigation port that mounts Menu first stays correct.

  // native -> JS: the device hub pushes keyboard frames; we read the height live.
  $effect(() => {
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
      keyboardHeight = height;
    };
    const subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didHide, () => (keyboardHeight = 0)),
    ];
    return () => subscriptions.forEach(subscription => subscription.remove());
  });

  // native -> JS: AppState pushes lifecycle changes; read the current phase live.
  $effect(() => {
    const subscription = AppState.addEventListener('change', (...args: unknown[]) => {
      const next = args[0];
      if (typeof next === 'string') appState = next;
    });
    return () => subscription.remove();
  });

  function onRefresh(): void {
    refreshing = true;
    setTimeout(() => {
      refreshing = false;
      refreshes += 1;
    }, REFRESH_MS);
  }

  // Tier A runtime modules, read live. A non-empty Version proves PlatformConstants resolved; a
  // fractional hairline (e.g. 0.333 on @3x) proves DeviceInfo's scale resolved.
  const hairlineText = $derived(
    `${Platform.OS} ${Platform.Version}` +
      `${Platform.isPad ? ' · iPad' : ''}` +
      ` · ${Platform.select({ ios: 'native ios', android: 'native android', default: '?' })}` +
      ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`,
  );
  // Real w×h@scale proves Dimensions + PixelRatio; a colorScheme proves Appearance; appState flips
  // when you background the app (AppState's device events).
  const dimensionsText = $derived(
    `${Math.round(windowSize.current.width)}×${Math.round(windowSize.current.height)}` +
      ` @${PixelRatio.get()}x · ${colorScheme.current ?? 'no-scheme'} · ${appState}`,
  );

  // JS->native StatusBar window flags (Android). setBackgroundColor/setTranslucent imperative drives.
  function onToggleStatusBarRed(): void {
    statusBarRed = !statusBarRed;
    StatusBar.setBackgroundColor(statusBarRed ? STATUS_BAR_RED : STATUS_BAR_DEFAULT, true);
  }
  function onToggleStatusBarTranslucent(): void {
    statusBarTranslucent = !statusBarTranslucent;
    StatusBar.setTranslucent(statusBarTranslucent);
  }

  // JS -> native imperative modules. A Promise reject (no native module / user cancel) is
  // expected, so it's swallowed; this is a demo, not a flow to handle.
  function onShare(): void {
    void Share.share({ message: 'Sent from symbiote', url: 'https://svelte.com' }).catch(() => {});
  }
  function onAlert(): void {
    Alert.alert('symbiote', 'Native AlertManager reached.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Vibrate', onPress: () => Vibration.vibrate() },
    ]);
  }
  function onActionSheet(): void {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Share', 'Vibrate', 'Cancel'], cancelButtonIndex: 2 },
      (index: number) => {
        if (index === 0) onShare();
        if (index === 1) Vibration.vibrate();
      },
    );
  }
  function onOpenUrl(): void {
    void Linking.openURL('https://svelte.com').catch(() => {});
  }

  function onRetentionMove(event: ISymbioteEvent): void {
    retentionMove = {
      dx: Math.round(nativeNumber(event, 'locationX')),
      dy: Math.round(nativeNumber(event, 'locationY')),
    };
  }

  // maintainVisibleContentPosition list: prepend without jump.
  function onPrepend(): void {
    mvcpHead -= PREPEND_COUNT;
    const head = mvcpHead;
    const prepended = Array.from({ length: PREPEND_COUNT }, (_unused, index) => {
      const n = head + index;
      return { id: `row-${n}`, label: `item ${n}` };
    });
    mvcpItems = [...prepended, ...mvcpItems];
  }

  // Native-driver proof for Animated.event: JAM the JS thread 3s, then drag the box during the
  // freeze. If the bar keeps fading/lifting while JS is frozen, the scroll drives parityScrollY on
  // the UI thread (native attach); if it sticks until the thread frees, it was JS-driven.
  function freezeJs(): void {
    const until = Date.now() + FREEZE_MS;
    while (Date.now() < until) {
      // Intentionally block the JS thread: no JS frame can run here, so any header motion during
      // the freeze must be coming from the native driver.
    }
  }
</script>

<SafeAreaView class="screen"
  ><ScrollView
    testID="canary-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
    refreshControl={{ refreshing, onRefresh, tintColor: accent }}
    ><!-- JS->native: StatusBar renders nothing; it drives the OS status bar imperatively. --><StatusBar
      barStyle={darkStatusBar ? 'dark-content' : 'light-content'}
      hidden={statusBarHidden}
      animated
    /><View class={`line-tag line-tag-${lineInfo.line}`}
      ><Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text></View
    ><View class="hero-card"
      ><View class="hero-badge"><Text class="hero-badge-text">{lineInfo.code}</Text></View><View
        class="hero-copy"
        ><Text class="hero-title">All primitives</Text><!-- one physical line on purpose: unlike
        Vue's template compiler, Svelte does NOT condense whitespace inside a text node, so a
        wrapped sentence would ship its newline + indent straight into RCTText.
        --><Text class="hero-body">Every @symbiote-native/svelte primitive, driven straight onto Fabric — no react-native renderer in the path.</Text
        ></View
      ></View
    ><!-- native->JS: keyboard height pushed from the device hub, read live --><Text
      class="header-note"
      >{keyboardHeight > 0 ? `keyboard up · ${keyboardHeight}px` : 'keyboard down'}</Text
    ><!-- Tier A runtime modules, live. The border below IS the hairline. --><Text
      class="hairline-note"
      style={{ borderTopWidth: StyleSheet.hairlineWidth }}>{hairlineText}</Text
    ><!-- Tier B runtime modules, live. --><Text class="header-note">{dimensionsText}</Text
    ><!-- JS->native StatusBar controls: watch the top strip react --><View class="row"
      ><View class="flex1"
        ><ActionButton
          title={statusBarHidden ? 'Show status bar' : 'Hide status bar'}
          onPress={() => (statusBarHidden = !statusBarHidden)}
          color={accent}
        /></View
      ><View class="flex1"
        ><ActionButton
          title={darkStatusBar ? 'Light text' : 'Dark text'}
          onPress={() => (darkStatusBar = !darkStatusBar)}
          color={accent}
        /></View
      ></View
    ><!-- Android-only window flags: the blank-risk pair. PASS: the top strip turns red / goes
         translucent and the app STAYS rendered. -->{#if Platform.OS === 'android'}<View class="row"
        ><View class="flex1"
          ><ActionButton
            title={statusBarRed ? 'BG default' : 'BG red'}
            onPress={onToggleStatusBarRed}
            color={accent}
          /></View
        ><View class="flex1"
          ><ActionButton
            title={statusBarTranslucent ? 'Opaque' : 'Translucent'}
            onPress={onToggleStatusBarTranslucent}
            color={accent}
          /></View
        ></View
      >{/if}<!-- JS->native imperative modules: tap to fire the real native UI / haptics. --><View
      class="row"
      ><View class="flex1"><ActionButton title="Alert" onPress={onAlert} color={accent} /></View
      ><!-- ActionSheetIOS is iOS-only by design (no Android native module exists).
      -->{#if Platform.OS !== 'android'}<View class="flex1"
          ><ActionButton title="Action sheet" onPress={onActionSheet} color={accent} /></View
        >{/if}</View
    ><View class="row"
      ><View class="flex1"><ActionButton title="Share" onPress={onShare} color={accent} /></View
      ><View class="flex1"
        ><ActionButton title="Vibrate" onPress={() => Vibration.vibrate()} color={accent} /></View
      ></View
    ><ActionButton title="Open svelte.com" onPress={onOpenUrl} color={accent} /><!--
      The native UIRefreshControl spinner only shows while iOS holds the pull-down; our full
      re-commit snaps the offset back, so we drive our OWN indicator from `refreshing`.
    -->{#if refreshing}<View class="refresh-row"
        ><ActivityIndicator color={accent} /><Text class="accent-note">Refreshing…</Text></View
      >{:else}<Text class="muted-center">{`pull to refresh · refreshed ${refreshes}×`}</Text
      >{/if}<!-- View + press-to-increment --><View
      testID="counter-card"
      onPress={() => (count += 1)}
      class="counter-card"
      ><Text testID="counter-value" class="counter-text">{`tapped ${count}×`}</Text></View
    ><!-- TextInput + greeting --><TextInput
      testID="greeting-input"
      value={name}
      onValueChange={next => (name = next)}
      placeholder="type your name…"
      placeholderTextColor={PLACEHOLDER_COLOR}
      class="text-input"
    /><Text testID="greeting-output" class="greeting"
      >{name ? `Hello, ${name}` : 'Hello, stranger'}</Text
    ><!-- Switch drives the ActivityIndicator --><View class="switch-row"
      ><Text class="switch-label">spinner</Text><Switch
        testID="spinner-switch"
        value={spinning}
        onValueChange={next => (spinning = next)}
        trackColor={{ false: HAIRLINE, true: accent }}
      /></View
    ><ActivityIndicator
      testID="spinner-indicator"
      animating={spinning}
      color={accent}
      size="large"
    /><!-- Slider: the @react-native-community/slider native view via @symbiote-native/slider/svelte.
         The engine derives its events + tint processors from the library's ViewConfig; the same
         wrapper backs the React canary. --><View class="section-tight"
      ><Text class="switch-label">{`volume · ${Math.round(volume * 100)}%`}</Text><Slider
        value={volume}
        onValueChange={next => (volume = next)}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        minimumTrackTintColor={accent}
        maximumTrackTintColor={HAIRLINE}
        thumbTintColor="#ffffff"
        class="slider"
      /></View
    ><!-- Animated: JS driver vs native driver, side by side --><AnimatedDemo
    /><!-- Animated: ValueXY, tracking, diffClamp --><AnimatedParityDemo
    /><!-- Runtime modules: I18nManager, Settings, Image statics --><NativeModulesDemo
    /><!-- Imperative host-ref API: measure / setNativeProps / findNodeHandle --><RefApiDemo
    /><!-- PlatformColor / DynamicColorIOS: native semantic + appearance-aware colors
    --><PlatformColorDemo
    /><!-- Accessibility: a11y props to native, aria/role transform, AccessibilityInfo
    --><AccessibilityDemo
    /><!-- Responder: drag-vs-tap + mid-gesture transfer (move-should-set / takeover)
    --><ResponderDemo
    /><!-- Component-local style block: compound selector, static and dynamic class
    --><CompoundClassDemo
    /><!-- Parity checks: longPress · Keyboard.dismiss · animated scroll · sticky · a11y focus
    --><ParityDemo /><!-- Opens a Modal --><ActionButton
      testID="modal-open"
      title="Open modal"
      onPress={() => (modalVisible = true)}
      color={accent}
    /><!-- Pressable's static look lives in .pressable-card; only the press-state-dependent colors
         stay a style function. Children take the press state through a snippet parameter.
    --><Pressable
      onPress={() => (count += 1)}
      class="pressable-card"
      style={({ pressed }) => ({
        backgroundColor: pressed ? SURFACE_PRESSED : SURFACE,
        borderColor: accent,
      })}
      >{#snippet children({ pressed })}<Text
          class="pressable-label"
          style={{ color: pressed ? accent : CHALK }}
          >{pressed ? 'holding…' : 'press me (also +1)'}</Text
        >{/snippet}</Pressable
    ><!-- Horizontal FlatList: real windowing. --><Text class="section-label"
      >FlatList · 24 chips, windowed</Text
    ><FlatList
      testID="chips-list"
      data={chips}
      horizontal
      keyExtractor={item => item.id}
      getItemLayout={(_data, index) => ({
        length: CHIP_WIDTH + CHIP_GAP,
        offset: (CHIP_WIDTH + CHIP_GAP) * index,
        index,
      })}
      class="chip-list"
      >{#snippet item({ item })}<!-- width/marginRight stay dynamic — they reference the
        CHIP_WIDTH/CHIP_GAP script consts (also used by getItemLayout above), which a CSS selector
        has no way to read; backgroundColor is per-chip (item.color). --><View
          class="chip-card"
          style={{ width: CHIP_WIDTH, marginRight: CHIP_GAP, backgroundColor: item.color }}
          ><Text class="chip-number">{item.index}</Text></View
        >{/snippet}</FlatList
    ><!-- ===== feature-parity device checks =====

         Press-retention measured rect. PASS: press, then drag DOWN ~100px: the panel STAYS
         highlighted (inside the measured rect + 80px bottom retention). Drag UP off the top:
         highlight drops. Proves measured-rect retention rather than a symmetric-radius
         approximation. The dx/dy readout tracks the move offset. The static look lives in
         .retention-card; only the press-state-dependent background stays a style function.
    --><Pressable
      hitSlop={{ top: 0, bottom: 40, left: 0, right: 0 }}
      pressRetentionOffset={{ top: 0, bottom: 80, left: 0, right: 0 }}
      onPressMove={onRetentionMove}
      class="retention-card"
      style={({ pressed }) => ({ backgroundColor: pressed ? accent : SURFACE })}
      ><Text class="info-text"
        >{`drag me · dx ${retentionMove.dx} · dy ${retentionMove.dy}`}</Text
      ></Pressable
    ><!-- maintainVisibleContentPosition. PASS: scroll down a bit, tap Prepend: the rows you are
         looking at DO NOT jump; new items appear above without shifting the viewport. FAIL: the
         list jumps to the top. box-list160 is shared with the Animated.ScrollView below.
    --><Text class="section-label">MVCP · prepend without jump</Text><FlatList
      testID="mvcp-list"
      data={mvcpItems}
      keyExtractor={item => item.id}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      class="box-list160"
      >{#snippet item({ item })}<View class="mvcp-row"
          ><Text class="list-row-text">{item.label}</Text></View
        >{/snippet}</FlatList
    ><ActionButton title="Prepend 5" color={accent} onPress={onPrepend} /><!--
      Animated.ScrollView scroll-driven header (native driver). PASS: drag INSIDE the box below
      (not the page): the bright bar above SMOOTHLY fades to near-invisible and lifts, on the UI
      thread (no jank, no per-frame JS). Proves Animated.ScrollView + Animated.event native attach.
    --><AnimatedView
      class="parity-header"
      style={{
        opacity: parityHeaderOpacity,
        transform: [{ translateY: parityHeaderTranslateY }],
      }}
      ><Text class="parity-header-text">HEADER — fades as you scroll ↓</Text></AnimatedView
    ><!-- box-list160 is shared with the MVCP FlatList above. --><AnimatedScrollView
      class="box-list160"
      scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS}
      onScroll={onParityScroll}
      >{#each scrollRows as row (row)}<View class="scroll-demo-row"
          ><Text class="list-row-text">{`scroll me · row ${row}`}</Text></View
        >{/each}</AnimatedScrollView
    ><Text class="tiny-center">↑ drag inside the box — the bar above reacts</Text><!--
      Native-driver proof for Animated.event: tap to JAM the JS thread 3s, then drag the box above
      DURING the freeze. If the bar keeps fading/lifting while JS is frozen, the scroll event
      drives parityScrollY on the UI thread (native attach). If it sticks until the thread frees,
      it was JS-driven.
    --><ActionButton title="Freeze JS 3s — then scroll the box ↑" color={WARN} onPress={freezeJs}
    /><Text class="tiny-center">tap Freeze, then immediately drag the box — bar should still move</Text
    ><!-- Modern style props reaching Fabric's C++ parser. Each is an A/B so the effect is
         unmistakable on the dark theme. boxShadow: a FLAME glow (a black shadow is invisible on
         the near-black bg). PASS: a soft orange halo bleeds out around the panel. --><View
      class="shadow-card"
      style={{ boxShadow: `0px 0px 22px 3px ${accent}88` }}
      ><Text class="note-text">boxShadow · flame glow</Text></View
    ><!-- filter: same base colour both sides; the right one is darkened by brightness(0.5).
         PASS: the right panel is clearly darker than the left. --><View class="row"
      ><View class="filter-tile"><Text class="tile-text">no filter</Text></View><View
        class="filter-tile"
        style={{ filter: [{ brightness: 0.5 }] }}
        ><Text class="tile-text">brightness 0.5</Text></View
      ></View
    ><!-- transformOrigin: the panel rotates around its TOP-LEFT corner, not its centre.
         PASS: the left edge stays put while the bottom-right swings down. --><View
      class="rotated-card"
      style={{ transformOrigin: 'top left', transform: [{ rotate: '4deg' }] }}
      ><Text class="tile-text">transformOrigin · top-left</Text></View
    ><!-- background-image: a CSS `linear-gradient(...)` authored entirely in App.css
         (.gradient-card), proving @symbiote-native/css-parser's `background-image` → RN's
         `experimental_backgroundImage` raw passthrough works end to end. PASS: the panel shows a
         flame-to-peach gradient sweeping left to right. --><View class="gradient-card"
      ><Text class="tile-text">background-image · linear-gradient</Text></View
    ><!-- Image web aliases. PASS: the logo loads via the web-alias fold (src→source uri,
         width/height→style); a screen reader reads "Svelte logo" (alt→accessibilityLabel). --><Image
      src="https://svelte.dev/favicon.png"
      alt="Svelte logo"
      width={48}
      height={48}
      class="web-image"
    /><!-- KeyboardAvoidingView enabled toggle. PASS: with enabled ON, focusing the field lifts it
         above the keyboard AND the keyboard is the email layout (proves autoComplete/inputMode
         fold); with enabled OFF the keyboard covers the field. --><View class="switch-row"
      ><Text class="switch-label">avoid keyboard</Text><Switch
        value={kavEnabled}
        onValueChange={next => (kavEnabled = next)}
        trackColor={{ false: HAIRLINE, true: accent }}
      /></View
    ><KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled={kavEnabled}
      ><TextInput
        autoComplete="email"
        inputMode="email"
        enterKeyHint="done"
        placeholder="email — focus me near the bottom…"
        placeholderTextColor={PLACEHOLDER_COLOR}
        class="text-input"
      /></KeyboardAvoidingView
    ><Image source={{ uri: 'https://svelte.dev/favicon.png' }} class="logo-image" /><View
      class="bottom-card"
      ><Text class="bottom-text">↑ you scrolled to the bottom</Text></View
    ><!-- Modal overlays its own window --><Modal
      visible={modalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => (modalVisible = false)}
      >{#snippet children()}<!-- transparent modal => paint our own dim layer (the RN pattern)
        --><View class="modal-overlay"
          ><View testID="modal-card" class="modal-card"
            ><Text class="modal-title">It's a Modal</Text><Text class="modal-body"
              >Rendered through ModalHostView — its own native window, same Fabric tree.</Text
            ><ActionButton
              testID="modal-close"
              title="Close"
              onPress={() => (modalVisible = false)}
              color={accent}
            /></View
          ></View
        >{/snippet}</Modal
    ><!-- createTunnel: no ref, no target node — TunnelIn just registers its snippet content from
         wherever it's mounted; TunnelOut (rendered in the overlay host below) reads it back
         through its OWN normal render, wherever that happens to be mounted, even a different
         surface. This is the Svelte adapter's answer to Vue's <Teleport>, which has no twin here.
    --><ActionButton
      testID="tunnel-toast-open"
      title="Show toast (createTunnel)"
      onPress={() => (tunnelToastVisible = true)}
      color={accent}
    />{#if tunnelToastVisible}<TunnelIn tunnel={overlayTunnel}
        >{#snippet children()}<View testID="tunnel-toast-card" class="modal-card"
            ><Text class="modal-body">Ported via createTunnel ✦</Text><ActionButton
              testID="tunnel-toast-dismiss"
              title="Dismiss"
              onPress={() => (tunnelToastVisible = false)}
              color={accent}
            /></View
          >{/snippet}</TunnelIn
      >{/if}</ScrollView
  ><!-- The tunnel target: a persistent, empty View sitting above the scroll content.
       pointerEvents="box-none" lets touches pass through everywhere except an actual ported child
       (the toast card). --><View
    testID="overlay-host"
    pointerEvents="box-none"
    class="overlay-host"
    ><TunnelOut tunnel={overlayTunnel} /></View
  ></SafeAreaView
>
