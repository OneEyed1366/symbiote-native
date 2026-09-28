<script lang="ts">
  // The Svelte canary - a 1:1 port of examples/vue-sfc/CanaryScreen.vue, themed in Svelte's own
  // brand colors (App.css --flame, github.com/sveltejs/branding). Every demo past the hero header
  // lives in its own file under ../components, composed below in the same order as the other roots.
  import {
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
    createTunnel,
    TunnelOut,
    useWindowDimensions,
    useColorScheme,
    type ITextInputChangeEvent,
    type ISwitchChangeEvent,
  } from '@symbiote-native/svelte';
  import type { IPressState } from '@symbiote-native/components';
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
  import ModalDemo from '../components/ModalDemo.svelte';
  import WindowedListsDemo from '../components/WindowedListsDemo.svelte';
  import FeatureParityChecksDemo from '../components/FeatureParityChecksDemo.svelte';
  import ScrollParityDemo from '../components/ScrollParityDemo.svelte';
  import StyleShowcaseDemo from '../components/StyleShowcaseDemo.svelte';
  // createTunnel: the Svelte answer to Vue's Teleport (neither Svelte nor Vue has a reconciler,
  // so neither has React createPortal's Fiber-level hook point either).
  import TunnelToastDemo from '../components/TunnelToastDemo.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, NAV_LINE, ROUTE_LINE_INFO } from '../navigation-lines';

  const REFRESH_MS = 2_000;
  const STATUS_BAR_RED = '#ff0000';
  const STATUS_BAR_DEFAULT = '#1a1a1a';
  const PLACEHOLDER_COLOR = '#6a6a6a';
  const SURFACE = '#262626';
  const SURFACE_PRESSED = '#0f0f0f';
  const HAIRLINE = '#3a3a3a';
  const CHALK = '#cbd5e1';

  // Svelte's brand flame, read from the ONE place it is defined (navigation-lines.ts) rather than
  // re-typed here - the same indirection the Vue canary uses for its green.
  const accent = LINE_COLOR[NAV_LINE.Primitives];

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
  let refreshing = $state(false);
  let refreshes = $state(0);
  let keyboardHeight = $state(0);
  let statusBarHidden = $state(false);
  let darkStatusBar = $state(false);
  // Android-only StatusBar window flags: the blank-risk pair (device-verify-pending).
  let statusBarRed = $state(false);
  let statusBarTranslucent = $state(false);

  // Tier B runtime modules, read live: the runes pull from Dimensions/Appearance, appState tracks
  // foreground/background through AppState's device events.
  const windowSize = useWindowDimensions();
  const colorScheme = useColorScheme();
  let appState = $state<string>(AppState.currentState ?? 'unknown');

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
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="canary-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <!-- An ordinary CHILD, not a prop: the scroll behavior CLAIMS a `refresh-control` and places it
      per platform - beside the content view on iOS, wrapping the scroll view on Android. -->
    <refresh-control p={{ refreshing, onRefresh, tintColor: accent }} />
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
        <!-- one physical line on purpose: Svelte does NOT condense whitespace inside a text
        node like Vue's compiler does, so a wrapped sentence would ship its newline straight
        into RCTText. -->
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
      <!-- ActionSheetIOS is iOS-only by design (no Android native module exists). -->
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
    <!-- The native UIRefreshControl spinner only shows while iOS holds the pull-down; our full
      re-commit snaps the offset back, so we drive our OWN indicator from `refreshing`. -->
    {#if refreshing}
      <view class="refresh-row">
        <activity-indicator color={accent} />
        <text class="accent-note">Refreshing…</text>
      </view>
    {:else}
      <text class="muted-center">
        {`pull to refresh · refreshed ${refreshes}×`}
      </text>
    {/if}<!-- View + press-to-increment -->
    <view
      testID="counter-card"
      p={{ onPress: () => (count += 1) }}
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
      onValueChange={(event: ITextInputChangeEvent) => (name = event.text)}
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
        onValueChange={(event: ISwitchChangeEvent) => (spinning = event.value)}
        trackColor={{ false: HAIRLINE, true: accent }}
      />
    </view>
    <activity-indicator
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
    <!-- Modal, its own native window -->
    <ModalDemo />
    <!-- Only the press-state-dependent colors stay a style function (tag resolves it at both
         values of `pressed`); a CHILD reading press state has no such channel, so the screen
         tracks it itself, which is what any app wanting to style a descendant has to do. -->
    <pressable
      p={{
        onPress: () => (count += 1),
        onPressIn: () => (cardPressed = true),
        onPressOut: () => (cardPressed = false),
      }}
      class="pressable-card"
      style={({ pressed }: IPressState) => ({
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
    <!-- feature-parity device checks, one component per cluster -->
    <WindowedListsDemo />
    <FeatureParityChecksDemo />
    <ScrollParityDemo />
    <StyleShowcaseDemo />
    <!-- source-object image form (uri), unlike StyleShowcaseDemo's src-string web alias -->
    <image
      source={{ uri: 'https://svelte.dev/favicon.png' }}
      class="logo-image"
    />
    <view class="bottom-card">
      <text class="bottom-text">↑ you scrolled to the bottom</text>
    </view>
    <TunnelToastDemo tunnel={overlayTunnel} />
  </scroll-view>
  <!-- The tunnel target: a persistent, empty View sitting above the scroll content.
       pointerEvents="box-none" lets touches pass through everywhere except an actual ported child
       (the toast card). -->
  <view testID="overlay-host" pointerEvents="box-none" class="overlay-host">
    <TunnelOut tunnel={overlayTunnel} />
  </view>
</safe-area-view>
