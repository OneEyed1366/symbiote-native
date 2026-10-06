import { defineComponent, ref } from 'vue';
import {
  Image,
  clearDiskCache,
  clearMemoryCache,
  getCachePathAsync,
  prefetchImages,
} from '@symbiote-native/image/vue';
import type { IImageViewHandle } from '@symbiote-native/image/vue';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ResultRow, ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { BLURHASH, GALLERY_URLS, GREY_BLURHASH, photoUrl } from './image-assets';
import { ImageExtras } from './image-extras';
import { BROKEN_URI, CACHE_KEY, FITS, describeLoad, showResult } from './image-helpers';

const ROUTE = ROUTE_NAME.Image;
const color = lineColorOf(ROUTE);

const SmoothLoadScenario = defineComponent(
  () => {
    const loadLine = ref('loading…');
    const round = ref(0);
    return () => (
      <Scenario
        testID="image-smooth-scenario"
        title="Show a feed photo without a blank flash"
        why="Feeds and profiles show a blurred preview from a 28 character hash while the real photo downloads, then fade it in. Nothing jumps and no layout shifts."
        steps={['Press Load again, with the network on', 'Watch the area while the photo downloads']}
        expect="A colored blur appears at once, then the photo fades in over 400 ms. The line below reports the load result with its size and type."
      >
        <Image
          key={round.value}
          testID="image-hero"
          source={{ uri: `${photoUrl('1018', 800)}?round=${round.value}` }}
          placeholder={{ blurhash: BLURHASH }}
          contentFit="cover"
          transition={400}
          class="img-hero"
          onLoad={event => { loadLine.value = describeLoad(event); }}
          onError={event => { loadLine.value = `error: ${event.error}`; }}
          accessibilityLabel="Mountain lake at dawn"
        />
        <ResultRow testID="image-hero-result" label="onLoad" value={loadLine.value} />
        <ActionButton
          testID="image-hero-reload"
          title="Load again (new url)"
          color={color}
          onPress={() => {
            loadLine.value = 'loading…';
            round.value += 1;
          }}
        />
      </Scenario>
    );
  },
  { name: 'SmoothLoadScenario' },
);

const CacheScenario = defineComponent(
  () => {
    const round = ref(0);
    const loadLine = ref('not loaded yet');
    const pathLine = ref('unknown');
    const prefetchLine = ref('not prefetched');
    const handle = ref<IImageViewHandle | null>(null);

    const remount = () => {
      loadLine.value = 'loading…';
      round.value += 1;
    };
    const showPath = (text: string) => {
      pathLine.value = text;
    };
    const showPrefetch = (text: string) => {
      prefetchLine.value = text;
    };

    return () => (
      <Scenario
        testID="image-cache-scenario"
        title="Make a screen open instantly the second time"
        why="Images are cached in memory and on disk. Prefetching warms the cache before a gallery opens, and clearing it frees space or forces a fresh download."
        steps={[
          'Press Remount: the first load reports cache none',
          'Press Remount again: it reports memory',
          'Press Clear memory, then Remount: it reports disk',
          'Press Clear memory and disk, then Remount: it reports none again',
        ]}
        expect="The cache type moves none, memory, disk, none as described. Prefetch says true and the path button shows a file path after the first load."
      >
        <Image
          key={round.value}
          ref={handle}
          testID="image-cache-view"
          source={{ uri: photoUrl('1011', 500), cacheKey: CACHE_KEY }}
          cachePolicy="memory-disk"
          class="img-avatar"
          onLoad={event => { loadLine.value = describeLoad(event); }}
        />
        <ResultRow testID="image-cache-result" label="onLoad" value={loadLine.value} />
        <view class="button-row">
          <ActionButton testID="image-cache-remount" title="Remount" color={color} onPress={remount} />
          <ActionButton testID="image-cache-reload" title="reloadAsync()" color={color} onPress={() => void handle.value?.reloadAsync()} />
        </view>
        <view class="button-row">
          <ActionButton testID="image-cache-clear-memory" title="Clear memory" color={color} onPress={() => void clearMemoryCache()} />
          <ActionButton
            testID="image-cache-clear-all"
            title="Clear memory and disk"
            color={color}
            onPress={() => void Promise.all([clearMemoryCache(), clearDiskCache()])}
          />
        </view>
        <ActionButton
          testID="image-cache-path"
          title="getCachePathAsync(key)"
          color={color}
          onPress={() => showResult(() => getCachePathAsync(CACHE_KEY), showPath, path => path ?? 'null: not on disk')}
        />
        <ResultRow testID="image-cache-path-result" label="Disk path" value={pathLine.value} />
        <ActionButton
          testID="image-prefetch"
          title="Prefetch 4 gallery photos"
          color={color}
          onPress={() => {
            prefetchLine.value = 'prefetching…';
            return showResult(() => prefetchImages(GALLERY_URLS), showPrefetch, String);
          }}
        />
        <ResultRow testID="image-prefetch-result" label="prefetchImages()" value={prefetchLine.value} />
        <view class="img-grid">
          {GALLERY_URLS.map(uri => (
            <Image key={uri} source={uri} class="img-thumb" contentFit="cover" transition={150} />
          ))}
        </view>
      </Scenario>
    );
  },
  { name: 'CacheScenario' },
);

const FitScenario = defineComponent(
  () => () => (
    <Scenario
      testID="image-fit-scenario"
      title="Fit one photo into different boxes"
      why="Avatars crop, product photos must show everything, banners stretch. contentFit says how, like CSS object-fit, without extra wrapper views."
      steps={['Compare the five boxes, each holds the same square photo']}
      expect="cover fills the box and crops, contain shows the whole photo with bars, fill stretches it, none keeps the pixel size, scale-down is the smaller of none and contain."
    >
      <view class="img-grid">
        {FITS.map(fit => (
          <view key={fit} class="img-fit-cell">
            <view class="img-fit-frame">
              <Image testID={`image-fit-${fit}`} source={photoUrl('1025', 200)} contentFit={fit} class="img-fit-image" />
            </view>
            <text class="img-fit-label">{fit}</text>
          </view>
        ))}
      </view>
    </Scenario>
  ),
  { name: 'FitScenario' },
);

const ErrorScenario = defineComponent(
  () => {
    const round = ref(0);
    const isBroken = ref(true);
    const line = ref('loading…');
    return () => (
      <Scenario
        testID="image-error-scenario"
        title="Recover from a broken image"
        why="Links die. onError tells the app, a placeholder keeps the layout, and a retry button fixes it once the link works again."
        steps={['Look at the broken image', 'Press Fix the link']}
        expect="The first load shows an error line and the grey placeholder stays. After Fix the link the real photo loads and the line reports its size."
      >
        <Image
          key={round.value}
          testID="image-error-view"
          source={isBroken.value ? BROKEN_URI : photoUrl('1035', 400)}
          placeholder={{ blurhash: GREY_BLURHASH }}
          class="img-avatar"
          onLoad={event => { line.value = `loaded: ${describeLoad(event)}`; }}
          onError={event => { line.value = `error: ${event.error}`; }}
        />
        <ResultRow testID="image-error-result" label="Event" value={line.value} />
        <ActionButton
          testID="image-error-fix"
          title={isBroken.value ? 'Fix the link' : 'Break it again'}
          color={color}
          onPress={() => {
            line.value = 'loading…';
            isBroken.value = !isBroken.value;
            round.value += 1;
          }}
        />
      </Scenario>
    );
  },
  { name: 'ErrorScenario' },
);

export const ImageScreen = defineComponent(
  () => () => (
    <ScreenShell
      route={ROUTE}
      testID="image-scroll"
      title="Image"
      body="expo-image: the fast image view with disk and memory cache, placeholders, transitions and content fit, plus the cache API and animated images."
    >
      <SmoothLoadScenario />
      <CacheScenario />
      <FitScenario />
      <ErrorScenario />
      <ImageExtras />
    </ScreenShell>
  ),
  { name: 'ImageScreen' },
);
