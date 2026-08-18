// Three runtime modules, each read live so it only resolves on a real host: I18nManager (RTL
// layout constants), Settings (a value round-tripped through iOS NSUserDefaults via
// SettingsManager), and Image's static methods (getSize / queryCache / prefetch, which hit the
// ImageLoader native module).

import { createSignal, onCleanup } from 'solid-js';
import {
  I18nManager,
  Image,
  Settings,
  Text,
  View,
} from '@symbiote-native/solid';
import { ActionButton } from './ActionButton';
import './NativeModulesDemo.css';

const LOGO_URI = 'https://www.solidjs.com/img/logo/without-wordmark/logo.png';
// A distinct cache key for the prefetch demo: same asset, different URL (query string), so nothing
// has loaded it yet. The cache starts cold and the button visibly warms it, unlike LOGO_URI, which
// getSize + the <Image> already pulled in.
const PREFETCH_URI = `${LOGO_URI}?warm=symbiote`;
const TAP_KEY = 'symbiote.tapCount';

export function NativeModulesDemo() {
  // I18nManager: RTL constants, read once. A non-throwing read proves the module name resolved;
  // the values flip if you force RTL and relaunch.
  const rtl = I18nManager.getConstants();

  // Settings is a counter persisted to NSUserDefaults: seeded from the store, bumped and re-saved
  // on tap, and watched so an external write to the key reflects live. It survives a relaunch,
  // which is the whole point of the module.
  //
  // Seed and subscribe both run HERE, in one synchronous tick — where React/Vue/Svelte subscribe
  // from an effect, a tick after the seed read, leaving a window a native write can slip through.
  // And `Settings.get` is SYNCHRONOUS, so there is no async-seed race to guard against either
  // (the `hasNativeReading` flag pattern belongs only where the seed resolves later).
  const stored = Settings.get(TAP_KEY);
  const [persisted, setPersisted] = createSignal(
    typeof stored === 'number' ? stored : 0,
  );
  const watchId = Settings.watchKeys(TAP_KEY, () => {
    const next = Settings.get(TAP_KEY);
    if (typeof next === 'number') setPersisted(next);
  });
  onCleanup(() => Settings.clearWatch(watchId));

  const persistTap = (): void => {
    const next = persisted() + 1;
    Settings.set({ [TAP_KEY]: next });
    setPersisted(next);
  };

  // Image statics: getSize resolves the rendered logo's real pixel dimensions through ImageLoader
  // (the <Image> below paints that same asset).
  const [imageSize, setImageSize] = createSignal('measuring…');
  Image.getSize(LOGO_URI)
    .then(({ width, height }) => setImageSize(`${width}×${height}px`))
    .catch(() => setImageSize('unavailable'));

  // Prefetch on a COLD url nothing has loaded: queryCache shows it absent, the button warms it,
  // and a re-query flips the readout — the visible effect.
  const [cacheState, setCacheState] = createSignal('checking…');
  const refreshCache = (): void => {
    Image.queryCache([PREFETCH_URI])
      .then(cache => setCacheState(cache[PREFETCH_URI] ?? 'not cached'))
      .catch(() => setCacheState('unavailable'));
  };
  refreshCache();

  const prefetchLogo = (): void => {
    setCacheState('prefetching…');
    Image.prefetch(PREFETCH_URI)
      .then(() => refreshCache())
      .catch(() => setCacheState('unavailable'));
  };

  return (
    <View class="section-nested">
      <Text class="section-label">
        Runtime modules · I18nManager / Settings / Image statics
      </Text>

      {/* I18nManager: RTL layout constants, read live */}
      <Text class="module-text">
        {`RTL: ${rtl.isRTL ? 'on' : 'off'} · swap L/R: ${rtl.doLeftAndRightSwapInRTL ? 'yes' : 'no'}`}
      </Text>
      <ActionButton
        title={
          rtl.isRTL ? 'Force LTR (needs reload)' : 'Force RTL (needs reload)'
        }
        onPress={() => I18nManager.forceRTL(!rtl.isRTL)}
        color="#7aa2e3"
      />

      {/* Settings: counter persisted to NSUserDefaults, survives a relaunch */}
      <Text testID="persist-count" class="module-text">
        {`persisted taps: ${persisted()} · survives relaunch`}
      </Text>
      <ActionButton
        testID="persist-btn"
        title="Persist a tap"
        onPress={persistTap}
        color="#7aa2e3"
      />

      {/* Image statics: the rendered asset + getSize's measurement of it */}
      <View class="module-logo-row">
        <Image source={{ uri: LOGO_URI }} class="module-logo-thumb" />
        <Text testID="logo-size" class="module-text-flex">
          {`logo size: ${imageSize()}`}
        </Text>
      </View>

      {/* prefetch warms a cold url: not cached → (tap) → cached */}
      <Text class="module-text">{`prefetch cache: ${cacheState()}`}</Text>
      <ActionButton
        title="Prefetch logo"
        onPress={prefetchLogo}
        color="#7aa2e3"
      />
    </View>
  );
}
