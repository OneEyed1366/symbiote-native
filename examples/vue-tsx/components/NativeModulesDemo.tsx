import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import { I18nManager, Image, Settings } from '@symbiote-native/vue';

const LOGO_URI = 'https://vuejs.org/images/logo.png';
// A distinct URL for the prefetch demo, so the cache starts cold and the button visibly warms it
const PREFETCH_URI = 'https://vuejs.org/images/logo.png?warm=symbiote';
const TAP_KEY = 'symbiote.tapCount';
const ACCENT = '#42b883';

// A counter persisted through Settings: read on mount, bumped on tap and watched for outside writes
function usePersistedTaps() {
  const stored = Settings.get(TAP_KEY);
  const persisted = ref(typeof stored === 'number' ? stored : 0);
  let watchId: number | undefined;
  onMounted(() => {
    watchId = Settings.watchKeys(TAP_KEY, () => {
      const next = Settings.get(TAP_KEY);
      if (typeof next === 'number') persisted.value = next;
    });
  });
  onUnmounted(() => {
    if (watchId !== undefined) Settings.clearWatch(watchId);
  });
  const persistTap = (): void => {
    const next = persisted.value + 1;
    Settings.set({ [TAP_KEY]: next });
    persisted.value = next;
  };
  return { persisted, persistTap };
}

// getSize measures the rendered logo, queryCache and prefetch show a cold URL being warmed
function useImageStatics() {
  const imageSize = ref('measuring…');
  const cacheState = ref('checking…');
  onMounted(() => {
    Image.getSize(LOGO_URI)
      .then(({ width, height }) => {
        imageSize.value = `${width}×${height}px`;
      })
      .catch(() => {
        imageSize.value = 'unavailable';
      });
  });
  const refreshCache = (): void => {
    Image.queryCache([PREFETCH_URI])
      .then(cache => {
        cacheState.value = cache[PREFETCH_URI] ?? 'not cached';
      })
      .catch(() => {
        cacheState.value = 'unavailable';
      });
  };
  onMounted(() => refreshCache());
  const prefetchLogo = (): void => {
    cacheState.value = 'prefetching…';
    void Image.prefetch(PREFETCH_URI)
      .then(() => refreshCache())
      .catch(() => {
        cacheState.value = 'unavailable';
      });
  };
  return { imageSize, cacheState, prefetchLogo };
}

// Three runtime modules read live, so they only resolve on a real host
export const NativeModulesDemo = defineComponent({
  name: 'NativeModulesDemo',
  setup() {
    // A non-throwing read proves the module name resolved
    const rtl = I18nManager.getConstants();
    const { persisted, persistTap } = usePersistedTaps();
    const { imageSize, cacheState, prefetchLogo } = useImageStatics();
    return () => (
      <view class="section-nested">
        <text class="section-label">Runtime modules · I18nManager / Settings / Image statics</text>
        <text class="info-text">
          {`RTL: ${rtl.isRTL ? 'on' : 'off'} · swap L/R: ${rtl.doLeftAndRightSwapInRTL ? 'yes' : 'no'}`}
        </text>
        <button
          title={rtl.isRTL ? 'Force LTR (needs reload)' : 'Force RTL (needs reload)'}
          onPress={() => I18nManager.forceRTL(!rtl.isRTL)}
          color={ACCENT}
        />
        <text testID="persist-count" class="info-text">
          {`persisted taps: ${persisted.value} · survives relaunch`}
        </text>
        <button testID="persist-btn" title="Persist a tap" onPress={persistTap} color={ACCENT} />
        <view class="row-align-center">
          <image source={{ uri: LOGO_URI }} class="logo-thumb" />
          <text testID="logo-size" class="info-text-flex">
            {`logo size: ${imageSize.value}`}
          </text>
        </view>
        <text class="info-text">{`prefetch cache: ${cacheState.value}`}</text>
        <button title="Prefetch logo" onPress={prefetchLogo} color={ACCENT} />
      </view>
    );
  },
});
