import { For, createSignal } from 'solid-js';
import {
  Image,
  clearDiskCache,
  clearMemoryCache,
  getCachePathAsync,
  prefetchImages,
} from '@symbiote-native/image/solid';
import type { IImageViewHandle } from '@symbiote-native/image/solid';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ResultRow, ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { BLURHASH, GALLERY_URLS, GREY_BLURHASH, photoUrl } from './image-assets';
import { ImageExtras } from './image-extras';
import { BROKEN_URI, CACHE_KEY, FITS, describeLoad, showResult } from './image-helpers';

const ROUTE = ROUTE_NAME.Image;

function SmoothLoadScenario(props: { color: string }) {
  const [loadLine, setLoadLine] = createSignal('loading…');
  const [round, setRound] = createSignal(0);
  return (
    <Scenario
      testID="image-smooth-scenario"
      title="Show a feed photo without a blank flash"
      why="Feeds and profiles show a blurred preview from a 28 character hash while the real photo downloads, then fade it in. Nothing jumps and no layout shifts."
      steps={['Press Load again, with the network on', 'Watch the area while the photo downloads']}
      expect="A colored blur appears at once, then the photo fades in over 400 ms. The line below reports the load result with its size and type."
    >
      <For each={[round()]}>
        {current => (
          <Image
            testID="image-hero"
            source={{ uri: `${photoUrl('1018', 800)}?round=${current}` }}
            placeholder={{ blurhash: BLURHASH }}
            contentFit="cover"
            transition={400}
            class="img-hero"
            onLoad={event => setLoadLine(describeLoad(event))}
            onError={event => setLoadLine(`error: ${event.error}`)}
            accessibilityLabel="Mountain lake at dawn"
          />
        )}
      </For>
      <ResultRow testID="image-hero-result" label="onLoad" value={loadLine()} />
      <ActionButton
        testID="image-hero-reload"
        title="Load again (new url)"
        color={props.color}
        onPress={() => {
          setLoadLine('loading…');
          setRound(value => value + 1);
        }}
      />
    </Scenario>
  );
}

function CacheScenario(props: { color: string }) {
  const [round, setRound] = createSignal(0);
  const [loadLine, setLoadLine] = createSignal('not loaded yet');
  const [pathLine, setPathLine] = createSignal('unknown');
  const [prefetchLine, setPrefetchLine] = createSignal('not prefetched');
  let handle: IImageViewHandle | undefined;

  const remount = () => {
    setLoadLine('loading…');
    setRound(value => value + 1);
  };

  return (
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
      <For each={[round()]}>
        {() => (
          <Image
            ref={value => {
              handle = value;
            }}
            testID="image-cache-view"
            source={{ uri: photoUrl('1011', 500), cacheKey: CACHE_KEY }}
            cachePolicy="memory-disk"
            class="img-avatar"
            onLoad={event => setLoadLine(describeLoad(event))}
          />
        )}
      </For>
      <ResultRow testID="image-cache-result" label="onLoad" value={loadLine()} />
      <view class="button-row">
        <ActionButton testID="image-cache-remount" title="Remount" color={props.color} onPress={remount} />
        <ActionButton testID="image-cache-reload" title="reloadAsync()" color={props.color} onPress={() => void handle?.reloadAsync()} />
      </view>
      <view class="button-row">
        <ActionButton testID="image-cache-clear-memory" title="Clear memory" color={props.color} onPress={() => void clearMemoryCache()} />
        <ActionButton
          testID="image-cache-clear-all"
          title="Clear memory and disk"
          color={props.color}
          onPress={() => void Promise.all([clearMemoryCache(), clearDiskCache()])}
        />
      </view>
      <ActionButton
        testID="image-cache-path"
        title="getCachePathAsync(key)"
        color={props.color}
        onPress={() => showResult(() => getCachePathAsync(CACHE_KEY), setPathLine, path => path ?? 'null: not on disk')}
      />
      <ResultRow testID="image-cache-path-result" label="Disk path" value={pathLine()} />
      <ActionButton
        testID="image-prefetch"
        title="Prefetch 4 gallery photos"
        color={props.color}
        onPress={() => {
          setPrefetchLine('prefetching…');
          return showResult(() => prefetchImages(GALLERY_URLS), setPrefetchLine, String);
        }}
      />
      <ResultRow testID="image-prefetch-result" label="prefetchImages()" value={prefetchLine()} />
      <view class="img-grid">
        <For each={GALLERY_URLS}>
          {uri => <Image source={uri} class="img-thumb" contentFit="cover" transition={150} />}
        </For>
      </view>
    </Scenario>
  );
}

function FitScenario() {
  return (
    <Scenario
      testID="image-fit-scenario"
      title="Fit one photo into different boxes"
      why="Avatars crop, product photos must show everything, banners stretch. contentFit says how, like CSS object-fit, without extra wrapper views."
      steps={['Compare the five boxes, each holds the same square photo']}
      expect="cover fills the box and crops, contain shows the whole photo with bars, fill stretches it, none keeps the pixel size, scale-down is the smaller of none and contain."
    >
      <view class="img-grid">
        <For each={FITS}>
          {fit => (
            <view class="img-fit-cell">
              <view class="img-fit-frame">
                <Image testID={`image-fit-${fit}`} source={photoUrl('1025', 200)} contentFit={fit} class="img-fit-image" />
              </view>
              <text class="img-fit-label">{fit}</text>
            </view>
          )}
        </For>
      </view>
    </Scenario>
  );
}

function ErrorScenario(props: { color: string }) {
  const [round, setRound] = createSignal(0);
  const [isBroken, setIsBroken] = createSignal(true);
  const [line, setLine] = createSignal('loading…');
  return (
    <Scenario
      testID="image-error-scenario"
      title="Recover from a broken image"
      why="Links die. onError tells the app, a placeholder keeps the layout, and a retry button fixes it once the link works again."
      steps={['Look at the broken image', 'Press Fix the link']}
      expect="The first load shows an error line and the grey placeholder stays. After Fix the link the real photo loads and the line reports its size."
    >
      <For each={[round()]}>
        {() => (
          <Image
            testID="image-error-view"
            source={isBroken() ? BROKEN_URI : photoUrl('1035', 400)}
            placeholder={{ blurhash: GREY_BLURHASH }}
            class="img-avatar"
            onLoad={event => setLine(`loaded: ${describeLoad(event)}`)}
            onError={event => setLine(`error: ${event.error}`)}
          />
        )}
      </For>
      <ResultRow testID="image-error-result" label="Event" value={line()} />
      <ActionButton
        testID="image-error-fix"
        title={isBroken() ? 'Fix the link' : 'Break it again'}
        color={props.color}
        onPress={() => {
          setLine('loading…');
          setIsBroken(value => !value);
          setRound(value => value + 1);
        }}
      />
    </Scenario>
  );
}

export function ImageScreen() {
  const color = lineColorOf(ROUTE);
  return (
    <ScreenShell
      route={ROUTE}
      testID="image-scroll"
      title="Image"
      body="expo-image: the fast image view with disk and memory cache, placeholders, transitions and content fit, plus the cache API and animated images."
    >
      <SmoothLoadScenario color={color} />
      <CacheScenario color={color} />
      <FitScenario />
      <ErrorScenario color={color} />
      <ImageExtras color={color} />
    </ScreenShell>
  );
}
