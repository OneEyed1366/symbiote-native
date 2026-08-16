<script lang="ts">
  // Three runtime modules, each read live so it only resolves on a
  // real host: I18nManager (RTL layout constants), Settings (a value round-tripped
  // through iOS NSUserDefaults via SettingsManager), and Image's static methods
  // (getSize / queryCache / prefetch, which hit the ImageLoader native module).
  import {
    View,
    Text,
    Image,
    I18nManager,
    Settings,
  } from '@symbiote-native/svelte';
  import ActionButton from './ActionButton.svelte';

  const LOGO_URI = 'https://svelte.dev/favicon.png';
  // A distinct cache key for the prefetch demo: same asset, different URL (query
  // string), so nothing has loaded it yet. The cache starts cold and the button
  // visibly warms it, unlike LOGO_URI, which getSize + the <Image> already pulled in.
  const PREFETCH_URI = 'https://svelte.dev/favicon.png?warm=symbiote';
  const TAP_KEY = 'symbiote.tapCount';

  // I18nManager: RTL constants, read once at setup. A non-throwing read proves the
  // module name resolved; the values flip if you force RTL and relaunch.
  const rtl = I18nManager.getConstants();

  // Settings is a counter persisted to NSUserDefaults: read back on mount, bumped and
  // re-saved on tap, and watched so an external write to the key reflects live. It
  // survives a relaunch, which is the whole point of the module.
  const storedTaps = Settings.get(TAP_KEY);
  let persisted = $state(typeof storedTaps === 'number' ? storedTaps : 0);

  $effect(() => {
    const watchId = Settings.watchKeys(TAP_KEY, () => {
      const stored = Settings.get(TAP_KEY);
      if (typeof stored === 'number') persisted = stored;
    });
    return () => Settings.clearWatch(watchId);
  });

  function persistTap(): void {
    const next = persisted + 1;
    Settings.set({ [TAP_KEY]: next });
    persisted = next;
  }

  // Image statics: getSize resolves the rendered logo's real pixel dimensions
  // through ImageLoader (the <Image> below paints that same asset).
  let imageSize = $state('measuring…');
  $effect(() => {
    Image.getSize(LOGO_URI)
      .then(({ width, height }) => (imageSize = `${width}×${height}px`))
      .catch(() => (imageSize = 'unavailable'));
  });

  // Prefetch on a COLD url nothing has loaded: queryCache shows it absent, the
  // button warms it, and a re-query flips the readout, the visible effect.
  let cacheState = $state('checking…');
  function refreshCache(): void {
    Image.queryCache([PREFETCH_URI])
      .then(cache => (cacheState = cache[PREFETCH_URI] ?? 'not cached'))
      .catch(() => (cacheState = 'unavailable'));
  }
  $effect(() => refreshCache());
  function prefetchLogo(): void {
    cacheState = 'prefetching…';
    void Image.prefetch(PREFETCH_URI)
      .then(() => refreshCache())
      .catch(() => (cacheState = 'unavailable'));
  }
</script>

<!-- Edge-to-edge markup between siblings: svelte-adapter-dom-shim skill §16. -->
<View class="section-nested"
  ><Text class="section-label"
    >Runtime modules · I18nManager / Settings / Image statics</Text
  ><Text class="info-text"
    >{`RTL: ${rtl.isRTL ? 'on' : 'off'} · swap L/R: ${rtl.doLeftAndRightSwapInRTL ? 'yes' : 'no'}`}</Text
  ><ActionButton
    title={rtl.isRTL ? 'Force LTR (needs reload)' : 'Force RTL (needs reload)'}
    onPress={() => I18nManager.forceRTL(!rtl.isRTL)}
    color="#7fb5ff"
  /><Text testID="persist-count" class="info-text"
    >{`persisted taps: ${persisted} · survives relaunch`}</Text
  ><ActionButton
    testID="persist-btn"
    title="Persist a tap"
    onPress={persistTap}
    color="#7fb5ff"
  /><View class="row-align-center"
    ><Image source={{ uri: LOGO_URI }} class="logo-thumb" /><Text
      testID="logo-size"
      class="info-text-flex">{`logo size: ${imageSize}`}</Text
    ></View
  ><Text class="info-text">{`prefetch cache: ${cacheState}`}</Text><ActionButton
    title="Prefetch logo"
    onPress={prefetchLogo}
    color="#7fb5ff"
  /></View
>
