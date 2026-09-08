<script lang="ts">
  // The Svelte canary — a 1:1 port of examples/vue-sfc/screens/CanaryScreen.vue, themed in
  // Svelte's own brand colors. Every section, every PASS/FAIL device check and every prop of the
  // Vue screen is here; the palette is this example's own (App.css: --flame #ff3e00 from
  // github.com/sveltejs/branding, over the neutral dark --ink/--paper/--mist) instead of Vue's
  // green-on-navy, and the ONE external link points at svelte.dev.
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
  //  - Animated.FlatList / Animated.SectionList: wrapped on this adapter, but the lists below
  //    stay non-animated so this screen keeps demoing the plain list surface. The Vue screen
  //    doesn't use them either.
  //
  // Whitespace in this markup is free, unlike when the screen was written. The shim maps a
  // whitespace-only text node under a parent that takes no raw text to an anchor, so a gap
  // between siblings never reaches Fabric as an RCTRawText (svelte-adapter-dom-shim §16b), and
  // svelte.config.js's collapseTextWhitespace() folds a sentence wrapped across source lines.
  import {
    ScrollView,
    ActivityIndicator,
    Modal,
    FlatList,
    KeyboardAvoidingView,
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
  // The pressable card's own press state. The tag resolves ITS style at both values of `pressed`
  // on its own; a child that needs the same state has no channel from the element, so the screen
  // mirrors it from onPressIn/onPressOut.
  let cardPressed = $state(false);
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
  const scrollRows = Array.from(
    { length: SCROLL_ROW_COUNT },
    (_unused, index) => index,
  );

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
    const subscription = AppState.addEventListener(
      'change',
      (...args: unknown[]) => {
        const next = args[0];
        if (typeof next === 'string') appState = next;
      },
    );
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
    StatusBar.setBackgroundColor(
      statusBarRed ? STATUS_BAR_RED : STATUS_BAR_DEFAULT,
      true,
    );
  }
  function onToggleStatusBarTranslucent(): void {
    statusBarTranslucent = !statusBarTranslucent;
    StatusBar.setTranslucent(statusBarTranslucent);
  }

  // JS -> native imperative modules. A Promise reject (no native module / user cancel) is
  // expected, so it's swallowed; this is a demo, not a flow to handle.
  function onShare(): void {
    void Share.share({
      message: 'Sent from symbiote',
      url: 'https://svelte.dev',
    }).catch(() => {});
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
    void Linking.openURL('https://svelte.dev').catch(() => {});
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
    const prepended = Array.from(
      { length: PREPEND_COUNT },
      (_unused, index) => {
        const n = head + index;
        return { id: `row-${n}`, label: `item ${n}` };
      },
    );
    mvcpItems = [...prepended, ...mvcpItems];
  }

  // Text PROP updates after mount. Not a cosmetic demo: Text.svelte handed its host tag the LIVE
  // rest-props proxy, so the shim diffed that object against itself, found nothing changed, and
  // dropped every non-children prop update. Children still rendered, so the component looked fine.
  // Nothing on any canary changed a Text prop after mount, which is why it survived until the
  // Animated rewrite tripped over it (2026-08-19).
  let textLines = $state(1);
  function onToggleTextLines(): void {
    textLines = textLines === 1 ? 3 : 1;
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

<safe-area-view class="screen">
  <ScrollView
    testID="canary-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
    refreshControl={{ refreshing, onRefresh, tintColor: accent }}
  >
    <!-- JS->native: StatusBar renders nothing; it drives the OS status bar imperatively. -->
    <StatusBar
      barStyle={darkStatusBar ? 'dark-content' : 'light-content'}
      hidden={statusBarHidden}
      animated
    />

    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: accent }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">All primitives</text>
        <!-- one physical line on purpose: unlike
        Vue's template compiler, Svelte does NOT condense whitespace inside a text node, so a
        wrapped sentence would ship its newline + indent straight into RCTText.
        -->
        <text class="hero-body">
          Every @symbiote-native/svelte primitive, driven straight onto Fabric —
          no react-native renderer in the path.
        </text>
      </view>
    </view>
    <!-- native->JS: keyboard height pushed from the device hub, read live -->
    <text class="header-note">
      {keyboardHeight > 0
        ? `keyboard up · ${keyboardHeight}px`
        : 'keyboard down'}
    </text>
    <!-- Tier A runtime modules, live. The border below IS the hairline. -->
    <text
      class="hairline-note"
      style={{ borderTopWidth: StyleSheet.hairlineWidth }}
    >
      {hairlineText}
    </text>
    <!-- Tier B runtime modules, live. -->
    <text class="header-note">{dimensionsText}</text>
    <!-- JS->native StatusBar controls: watch the top strip react -->
    <view class="row">
      <view class="flex1">
        <ActionButton
          title={statusBarHidden ? 'Show status bar' : 'Hide status bar'}
          onPress={() => (statusBarHidden = !statusBarHidden)}
          color={accent}
        />
      </view>
      <view class="flex1">
        <ActionButton
          title={darkStatusBar ? 'Light text' : 'Dark text'}
          onPress={() => (darkStatusBar = !darkStatusBar)}
          color={accent}
        />
      </view>
    </view>
    <!-- Android-only window flags: the blank-risk pair. PASS: the top strip turns red / goes
         translucent and the app STAYS rendered. -->
    {#if Platform.OS === 'android'}
      <view class="row">
        <view class="flex1">
          <ActionButton
            title={statusBarRed ? 'BG default' : 'BG red'}
            onPress={onToggleStatusBarRed}
            color={accent}
          />
        </view>
        <view class="flex1">
          <ActionButton
            title={statusBarTranslucent ? 'Opaque' : 'Translucent'}
            onPress={onToggleStatusBarTranslucent}
            color={accent}
          />
        </view>
      </view>
    {/if}<!-- JS->native imperative modules: tap to fire the real native UI / haptics. -->
    <view class="row">
      <view class="flex1">
        <ActionButton title="Alert" onPress={onAlert} color={accent} />
      </view>
      <!-- ActionSheetIOS is iOS-only by design (no Android native module exists).
      -->
      {#if Platform.OS !== 'android'}
        <view class="flex1">
          <ActionButton
            title="Action sheet"
            onPress={onActionSheet}
            color={accent}
          />
        </view>
      {/if}
    </view>
    <view class="row">
      <view class="flex1">
        <ActionButton title="Share" onPress={onShare} color={accent} />
      </view>
      <view class="flex1">
        <ActionButton
          title="Vibrate"
          onPress={() => Vibration.vibrate()}
          color={accent}
        />
      </view>
    </view>
    <ActionButton title="Open svelte.dev" onPress={onOpenUrl} color={accent} />
    <!--
      The native UIRefreshControl spinner only shows while iOS holds the pull-down; our full
      re-commit snaps the offset back, so we drive our OWN indicator from `refreshing`.
    -->
    {#if refreshing}
      <view class="refresh-row">
        <ActivityIndicator color={accent} />
        <text class="accent-note">Refreshing…</text>
      </view>
    {:else}
      <text class="muted-center">
        {`pull to refresh · refreshed ${refreshes}×`}
      </text>
    {/if}<!-- View + press-to-increment -->
    <view
      testID="counter-card"
      onPress={() => (count += 1)}
      class="counter-card"
    >
      <text testID="counter-value" class="counter-text">
        {`tapped ${count}×`}
      </text>
    </view>
    <!-- TextInput + greeting -->
    <text-input
      testID="greeting-input"
      value={name}
      onValueChange={(next: string) => (name = next)}
      placeholder="type your name…"
      placeholderTextColor={PLACEHOLDER_COLOR}
      class="text-input"
    ></text-input>
    <text testID="greeting-output" class="greeting">
      {name ? `Hello, ${name}` : 'Hello, stranger'}
    </text>
    <!-- Switch drives the ActivityIndicator -->
    <view class="switch-row">
      <text class="switch-label">spinner</text>
      <switch
        testID="spinner-switch"
        value={spinning}
        onValueChange={(next: boolean) => (spinning = next)}
        trackColor={{ false: HAIRLINE, true: accent }}
      />
    </view>
    <ActivityIndicator
      testID="spinner-indicator"
      animating={spinning}
      color={accent}
      size="large"
    />
    <!-- Slider: the @react-native-community/slider native view via @symbiote-native/slider/svelte.
         The engine derives its events + tint processors from the library's ViewConfig; the same
         wrapper backs the React canary. -->
    <view class="section-tight">
      <text class="switch-label">
        {`volume · ${Math.round(volume * 100)}%`}
      </text>
      <Slider
        value={volume}
        onValueChange={next => (volume = next)}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        minimumTrackTintColor={accent}
        maximumTrackTintColor={HAIRLINE}
        thumbTintColor="#ffffff"
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
    <!-- PlatformColor / DynamicColorIOS: native semantic + appearance-aware colors
    -->
    <PlatformColorDemo />
    <!-- Accessibility: a11y props to native, aria/role transform, AccessibilityInfo
    -->
    <AccessibilityDemo />
    <!-- Responder: drag-vs-tap + mid-gesture transfer (move-should-set / takeover)
    -->
    <ResponderDemo />
    <!-- Component-local style block: compound selector, static and dynamic class
    -->
    <CompoundClassDemo />
    <!-- Parity checks: longPress · Keyboard.dismiss · animated scroll · sticky · a11y focus
    -->
    <ParityDemo />
    <!-- Opens a Modal -->
    <ActionButton
      testID="modal-open"
      title="Open modal"
      onPress={() => (modalVisible = true)}
      color={accent}
    />
    <!-- Pressable's static look lives in .pressable-card; only the press-state-dependent colors
         stay a style function. The tag resolves that function itself, at both values of `pressed`.
         A CHILD that reads the press state has no such channel — a `{#snippet children}` is a
         component thing and renders nothing on an element — so the screen tracks the state itself,
         which is what any app wanting to style a descendant has to do.
    -->
    <pressable
      onPress={() => (count += 1)}
      onPressIn={() => (cardPressed = true)}
      onPressOut={() => (cardPressed = false)}
      class="pressable-card"
      style={({ pressed }: { pressed: boolean }) => ({
        backgroundColor: pressed ? SURFACE_PRESSED : SURFACE,
        borderColor: accent,
      })}
    >
      <text
        class="pressable-label"
        style={{ color: cardPressed ? accent : CHALK }}
      >
        {cardPressed ? 'holding…' : 'press me (also +1)'}
      </text>
    </pressable>
    <!-- Horizontal FlatList: real windowing. -->
    <text class="section-label">FlatList · 24 chips, windowed</text>
    <FlatList
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
    >
      {#snippet item({
        item,
      })}<!-- width/marginRight stay dynamic — they reference the
        CHIP_WIDTH/CHIP_GAP script consts (also used by getItemLayout above), which a CSS selector
        has no way to read; backgroundColor is per-chip (item.color). -->
        <view
          class="chip-card"
          style={{
            width: CHIP_WIDTH,
            marginRight: CHIP_GAP,
            backgroundColor: item.color,
          }}
        >
          <text class="chip-number">{item.index}</text>
        </view>
      {/snippet}
    </FlatList>
    <!-- ===== feature-parity device checks =====

         Press-retention measured rect. PASS: press, then drag DOWN ~100px: the panel STAYS
         highlighted (inside the measured rect + 80px bottom retention). Drag UP off the top:
         highlight drops. Proves measured-rect retention rather than a symmetric-radius
         approximation. The dx/dy readout tracks the move offset. The static look lives in
         .retention-card; only the press-state-dependent background stays a style function.
    -->
    <pressable
      hitSlop={{ top: 0, bottom: 40, left: 0, right: 0 }}
      pressRetentionOffset={{ top: 0, bottom: 80, left: 0, right: 0 }}
      onPressMove={onRetentionMove}
      class="retention-card"
      style={({ pressed }: { pressed: boolean }) => ({
        backgroundColor: pressed ? accent : SURFACE,
      })}
    >
      <text class="info-text">
        {`drag me · dx ${retentionMove.dx} · dy ${retentionMove.dy}`}
      </text>
    </pressable>
    <!-- maintainVisibleContentPosition. PASS: scroll down a bit, tap Prepend: the rows you are
         looking at DO NOT jump; new items appear above without shifting the viewport. FAIL: the
         list jumps to the top. box-list160 is shared with the Animated.ScrollView below.
    -->
    <text class="section-label">MVCP · prepend without jump</text>
    <FlatList
      testID="mvcp-list"
      data={mvcpItems}
      keyExtractor={item => item.id}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      class="box-list160"
    >
      {#snippet item({ item })}
        <view class="mvcp-row">
          <text class="list-row-text">{item.label}</text>
        </view>
      {/snippet}<!--
        This list measures its own cells (no getItemLayout), and the divider is CHROME the list
        renders BETWEEN them — so it belongs to the distance from one row to the next, not to
        either row's height. That is the case the offset table has to get right; a model built by
        summing heights alone is short by every divider it skipped, and the content below a
        windowed-out region slides up and back as the window moves (core/components buildOffsets).
        Deliberately on the MVCP list: prepend-without-jump is exactly where an offset being off by
        a few points is visible.
      -->
      {#snippet separator()}
        <view class="mvcp-divider" />
      {/snippet}
    </FlatList>
    <ActionButton title="Prepend 5" color={accent} onPress={onPrepend} />
    <!--
      Text prop update after mount. PASS: tapping toggles the paragraph between one clamped line
      and three. FAIL: it stays on one line forever — the prop reached the component and was
      dropped before the host tag, the shape that silently froze EVERY non-children Text prop.
    -->
    <text class="section-label">Text · prop update after mount</text>
    <text
      testID="text-lines-probe"
      class="list-row-text"
      numberOfLines={textLines}
    >
      Tapping the button below flips numberOfLines between 1 and 3. This
      sentence is deliberately long enough that the clamp is unmistakable at a
      glance, without needing to read it.
    </text>
    <ActionButton
      title="Toggle numberOfLines ({textLines})"
      color={accent}
      onPress={onToggleTextLines}
    />
    <!--
      Animated.ScrollView scroll-driven header (native driver). PASS: drag INSIDE the box below
      (not the page): the bright bar above SMOOTHLY fades to near-invisible and lifts, on the UI
      thread (no jank, no per-frame JS). Proves Animated.ScrollView + Animated.event native attach.
    -->
    <view
      class="parity-header"
      style={{
        opacity: parityHeaderOpacity,
        transform: [{ translateY: parityHeaderTranslateY }],
      }}
    >
      <text class="parity-header-text">HEADER — fades as you scroll ↓</text>
    </view>
    <!-- box-list160 is shared with the MVCP FlatList above. -->
    <Animated.ScrollView
      class="box-list160"
      scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS}
      onScroll={onParityScroll}
    >
      {#each scrollRows as row (row)}
        <view class="scroll-demo-row">
          <text class="list-row-text">{`scroll me · row ${row}`}</text>
        </view>
      {/each}
    </Animated.ScrollView>
    <text class="tiny-center">
      ↑ drag inside the box — the bar above reacts
    </text>
    <!--
      Native-driver proof for Animated.event: tap to JAM the JS thread 3s, then drag the box above
      DURING the freeze. If the bar keeps fading/lifting while JS is frozen, the scroll event
      drives parityScrollY on the UI thread (native attach). If it sticks until the thread frees,
      it was JS-driven.
    -->
    <ActionButton
      title="Freeze JS 3s — then scroll the box ↑"
      color={WARN}
      onPress={freezeJs}
    />
    <text class="tiny-center">
      tap Freeze, then immediately drag the box — bar should still move
    </text>
    <!-- Modern style props reaching Fabric's C++ parser. Each is an A/B so the effect is
         unmistakable on the dark theme. boxShadow: a FLAME glow (a black shadow is invisible on
         the near-black bg). PASS: a soft orange halo bleeds out around the panel. -->
    <view
      class="shadow-card"
      style={{ boxShadow: `0px 0px 22px 3px ${accent}88` }}
    >
      <text class="note-text">boxShadow · flame glow</text>
    </view>
    <!-- filter: same base colour both sides; the right one is darkened by brightness(0.5).
         PASS: the right panel is clearly darker than the left. -->
    <view class="row">
      <view class="filter-tile">
        <text class="tile-text">no filter</text>
      </view>
      <view class="filter-tile" style={{ filter: [{ brightness: 0.5 }] }}>
        <text class="tile-text">brightness 0.5</text>
      </view>
    </view>
    <!-- transformOrigin: the panel rotates around its TOP-LEFT corner, not its centre.
         PASS: the left edge stays put while the bottom-right swings down. -->
    <view
      class="rotated-card"
      style={{ transformOrigin: 'top left', transform: [{ rotate: '4deg' }] }}
    >
      <text class="tile-text">transformOrigin · top-left</text>
    </view>
    <!-- background-image: a CSS `linear-gradient(...)` authored entirely in App.css
         (.gradient-card), proving @symbiote-native/css-parser's `background-image` → RN's
         `experimental_backgroundImage` raw passthrough works end to end. PASS: the panel shows a
         flame-to-peach gradient sweeping left to right. -->
    <view class="gradient-card">
      <text class="tile-text">background-image · linear-gradient</text>
    </view>
    <!-- Image web aliases. PASS: the logo loads via the web-alias fold (src→source uri,
         width/height→style); a screen reader reads "Svelte logo" (alt→accessibilityLabel). -->
    <image
      src="https://svelte.dev/favicon.png"
      alt="Svelte logo"
      width={48}
      height={48}
      class="web-image"
    />
    <!-- KeyboardAvoidingView enabled toggle. PASS: with enabled ON, focusing the field lifts it
         above the keyboard AND the keyboard is the email layout (proves autoComplete/inputMode
         fold); with enabled OFF the keyboard covers the field. -->
    <view class="switch-row">
      <text class="switch-label">avoid keyboard</text>
      <switch
        value={kavEnabled}
        onValueChange={(next: boolean) => (kavEnabled = next)}
        trackColor={{ false: HAIRLINE, true: accent }}
      />
    </view>
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled={kavEnabled}
    >
      <text-input
        autoComplete="email"
        inputMode="email"
        enterKeyHint="done"
        placeholder="email — focus me near the bottom…"
        placeholderTextColor={PLACEHOLDER_COLOR}
        class="text-input"
      ></text-input>
    </KeyboardAvoidingView>
    <image
      source={{ uri: 'https://svelte.dev/favicon.png' }}
      class="logo-image"
    />
    <view class="bottom-card">
      <text class="bottom-text">↑ you scrolled to the bottom</text>
    </view>
    <!-- Modal overlays its own window -->
    <Modal
      visible={modalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => (modalVisible = false)}
    >
      {#snippet children()}<!-- transparent modal => paint our own dim layer (the RN pattern)
        -->
        <view class="modal-overlay">
          <view testID="modal-card" class="modal-card">
            <text class="modal-title">It's a Modal</text>
            <text class="modal-body">
              Rendered through ModalHostView — its own native window, same
              Fabric tree.
            </text>
            <ActionButton
              testID="modal-close"
              title="Close"
              onPress={() => (modalVisible = false)}
              color={accent}
            />
          </view>
        </view>
      {/snippet}
    </Modal>
    <!-- createTunnel: no ref, no target node — TunnelIn just registers its snippet content from
         wherever it's mounted; TunnelOut (rendered in the overlay host below) reads it back
         through its OWN normal render, wherever that happens to be mounted, even a different
         surface. This is the Svelte adapter's answer to Vue's <Teleport>, which has no twin here.
    -->
    <ActionButton
      testID="tunnel-toast-open"
      title="Show toast (createTunnel)"
      onPress={() => (tunnelToastVisible = true)}
      color={accent}
    />
    {#if tunnelToastVisible}
      <TunnelIn tunnel={overlayTunnel}>
        {#snippet children()}
          <view testID="tunnel-toast-card" class="modal-card">
            <text class="modal-body">Ported via createTunnel ✦</text>
            <ActionButton
              testID="tunnel-toast-dismiss"
              title="Dismiss"
              onPress={() => (tunnelToastVisible = false)}
              color={accent}
            />
          </view>
        {/snippet}
      </TunnelIn>
    {/if}
  </ScrollView>
  <!-- The tunnel target: a persistent, empty View sitting above the scroll content.
       pointerEvents="box-none" lets touches pass through everywhere except an actual ported child
       (the toast card). -->
  <view testID="overlay-host" pointerEvents="box-none" class="overlay-host">
    <TunnelOut tunnel={overlayTunnel} />
  </view>
</safe-area-view>
