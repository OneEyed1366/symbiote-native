import { useCallback, useRef, useState } from 'react';
import {
  Image,
  clearDiskCache,
  clearMemoryCache,
  getCachePathAsync,
  prefetchImages,
} from '@symbiote-native/image/react';
import type {
  IImageContentFit,
  IImageLoadEventData,
  IImageViewHandle,
} from '@symbiote-native/image/react';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ResultRow, ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { BLURHASH, GALLERY_URLS, GREY_BLURHASH, photoUrl } from './image-assets';
import { ImageExtras } from './image-extras';

const ROUTE = ROUTE_NAME.Image;
const CACHE_KEY = 'canary-cache-demo';
const BROKEN_URI = 'https://picsum.photos/this-image-does-not-exist-404';
const FITS: readonly IImageContentFit[] = ['cover', 'contain', 'fill', 'none', 'scale-down'];

function describeLoad(event: IImageLoadEventData): string {
  const { width, height, mediaType } = event.source;
  return `cache: ${event.cacheType}, ${width}x${height}, ${mediaType ?? 'unknown type'}`;
}

function SmoothLoadScenario({ color }: { color: string }) {
  const [loadLine, setLoadLine] = useState('loading…');
  const [round, setRound] = useState(0);
  return (
    <Scenario
      testID="image-smooth-scenario"
      title="Show a feed photo without a blank flash"
      why="Feeds and profiles show a blurred preview from a 28 character hash while the real photo downloads, then fade it in. Nothing jumps and no layout shifts."
      steps={['Press Load again, with the network on', 'Watch the area while the photo downloads']}
      expect="A colored blur appears at once, then the photo fades in over 400 ms. The line below reports the load result with its size and type."
    >
      <Image
        key={round}
        testID="image-hero"
        source={{ uri: `${photoUrl('1018', 800)}?round=${round}` }}
        placeholder={{ blurhash: BLURHASH }}
        contentFit="cover"
        transition={400}
        className="img-hero"
        onLoad={event => setLoadLine(describeLoad(event))}
        onError={event => setLoadLine(`error: ${event.error}`)}
        accessibilityLabel="Mountain lake at dawn"
      />
      <ResultRow testID="image-hero-result" label="onLoad" value={loadLine} />
      <ActionButton
        testID="image-hero-reload"
        title="Load again (new url)"
        color={color}
        onPress={() => {
          setLoadLine('loading…');
          setRound(value => value + 1);
        }}
      />
    </Scenario>
  );
}

function CacheScenario({ color }: { color: string }) {
  const [round, setRound] = useState(0);
  const [loadLine, setLoadLine] = useState('not loaded yet');
  const [pathLine, setPathLine] = useState('unknown');
  const [prefetchLine, setPrefetchLine] = useState('not prefetched');
  const handle = useRef<IImageViewHandle>(null);

  const remount = useCallback(() => {
    setLoadLine('loading…');
    setRound(value => value + 1);
  }, []);

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
      <Image
        key={round}
        ref={handle}
        testID="image-cache-view"
        source={{ uri: photoUrl('1011', 500), cacheKey: CACHE_KEY }}
        cachePolicy="memory-disk"
        className="img-avatar"
        onLoad={event => setLoadLine(describeLoad(event))}
      />
      <ResultRow testID="image-cache-result" label="onLoad" value={loadLine} />
      <view className="button-row">
        <ActionButton testID="image-cache-remount" title="Remount" color={color} onPress={remount} />
        <ActionButton testID="image-cache-reload" title="reloadAsync()" color={color} onPress={() => void handle.current?.reloadAsync()} />
      </view>
      <view className="button-row">
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
        onPress={() => {
          getCachePathAsync(CACHE_KEY)
            .then(path => setPathLine(path ?? 'null: not on disk'))
            .catch((error: Error) => setPathLine(`failed: ${error.message}`));
        }}
      />
      <ResultRow testID="image-cache-path-result" label="Disk path" value={pathLine} />
      <ActionButton
        testID="image-prefetch"
        title="Prefetch 4 gallery photos"
        color={color}
        onPress={() => {
          setPrefetchLine('prefetching…');
          prefetchImages(GALLERY_URLS)
            .then(isDone => setPrefetchLine(String(isDone)))
            .catch((error: Error) => setPrefetchLine(`failed: ${error.message}`));
        }}
      />
      <ResultRow testID="image-prefetch-result" label="prefetchImages()" value={prefetchLine} />
      <view className="img-grid">
        {GALLERY_URLS.map(uri => (
          <Image key={uri} source={uri} className="img-thumb" contentFit="cover" transition={150} />
        ))}
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
      <view className="img-grid">
        {FITS.map(fit => (
          <view key={fit} className="img-fit-cell">
            <view className="img-fit-frame">
              <Image testID={`image-fit-${fit}`} source={photoUrl('1025', 200)} contentFit={fit} className="img-fit-image" />
            </view>
            <text className="img-fit-label">{fit}</text>
          </view>
        ))}
      </view>
    </Scenario>
  );
}

function ErrorScenario({ color }: { color: string }) {
  const [round, setRound] = useState(0);
  const [isBroken, setIsBroken] = useState(true);
  const [line, setLine] = useState('loading…');
  return (
    <Scenario
      testID="image-error-scenario"
      title="Recover from a broken image"
      why="Links die. onError tells the app, a placeholder keeps the layout, and a retry button fixes it once the link works again."
      steps={['Look at the broken image', 'Press Fix the link']}
      expect="The first load shows an error line and the grey placeholder stays. After Fix the link the real photo loads and the line reports its size."
    >
      <Image
        key={round}
        testID="image-error-view"
        source={isBroken ? BROKEN_URI : photoUrl('1035', 400)}
        placeholder={{ blurhash: GREY_BLURHASH }}
        className="img-avatar"
        onLoad={event => setLine(`loaded: ${describeLoad(event)}`)}
        onError={event => setLine(`error: ${event.error}`)}
      />
      <ResultRow testID="image-error-result" label="Event" value={line} />
      <ActionButton
        testID="image-error-fix"
        title={isBroken ? 'Fix the link' : 'Break it again'}
        color={color}
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
