<script lang="ts">
  import {
    Image,
    clearDiskCache,
    clearMemoryCache,
    getCachePathAsync,
    prefetchImages,
  } from '@symbiote-native/image/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { BLURHASH, GALLERY_URLS, GREY_BLURHASH, photoUrl } from './image-assets';
  import ImageExtras from './ImageExtras.svelte';
  import { BROKEN_URI, CACHE_KEY, FITS, describeLoad, showResult } from './image-helpers';

  const ROUTE = ROUTE_NAME.Image;
  const color = lineColorOf(ROUTE);

  let heroLine = $state('loading…');
  let heroRound = $state(0);

  let cacheRound = $state(0);
  let cacheLine = $state('not loaded yet');
  let pathLine = $state('unknown');
  let prefetchLine = $state('not prefetched');
  let cacheHandle = $state<{ reloadAsync: () => Promise<void> } | undefined>();

  let errorRound = $state(0);
  let isBroken = $state(true);
  let errorLine = $state('loading…');

  function remount(): void {
    cacheLine = 'loading…';
    cacheRound += 1;
  }

  function prefetch(): Promise<void> {
    prefetchLine = 'prefetching…';
    return showResult(() => prefetchImages(GALLERY_URLS), text => (prefetchLine = text), String);
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="image-scroll"
  title="Image"
  body="expo-image: the fast image view with disk and memory cache, placeholders, transitions and content fit, plus the cache API and animated images."
>
  <Scenario
    testID="image-smooth-scenario"
    title="Show a feed photo without a blank flash"
    why="Feeds and profiles show a blurred preview from a 28 character hash while the real photo downloads, then fade it in. Nothing jumps and no layout shifts."
    steps={['Press Load again, with the network on', 'Watch the area while the photo downloads']}
    expect="A colored blur appears at once, then the photo fades in over 400 ms. The line below reports the load result with its size and type."
  >
    {#key heroRound}
      <Image
        testID="image-hero"
        source={{ uri: `${photoUrl('1018', 800)}?round=${heroRound}` }}
        placeholder={{ blurhash: BLURHASH }}
        contentFit="cover"
        transition={400}
        class="img-hero"
        onLoad={event => (heroLine = describeLoad(event))}
        onError={event => (heroLine = `error: ${event.error}`)}
        accessibilityLabel="Mountain lake at dawn"
      />
    {/key}
    <ResultRow testID="image-hero-result" label="onLoad" value={heroLine} />
    <ActionButton
      testID="image-hero-reload"
      title="Load again (new url)"
      {color}
      onPress={() => {
        heroLine = 'loading…';
        heroRound += 1;
      }}
    />
  </Scenario>

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
    {#key cacheRound}
      <Image
        bind:this={cacheHandle}
        testID="image-cache-view"
        source={{ uri: photoUrl('1011', 500), cacheKey: CACHE_KEY }}
        cachePolicy="memory-disk"
        class="img-avatar"
        onLoad={event => (cacheLine = describeLoad(event))}
      />
    {/key}
    <ResultRow testID="image-cache-result" label="onLoad" value={cacheLine} />
    <view class="button-row">
      <ActionButton testID="image-cache-remount" title="Remount" {color} onPress={remount} />
      <ActionButton testID="image-cache-reload" title="reloadAsync()" {color} onPress={() => void cacheHandle?.reloadAsync()} />
    </view>
    <view class="button-row">
      <ActionButton testID="image-cache-clear-memory" title="Clear memory" {color} onPress={() => void clearMemoryCache()} />
      <ActionButton
        testID="image-cache-clear-all"
        title="Clear memory and disk"
        {color}
        onPress={() => void Promise.all([clearMemoryCache(), clearDiskCache()])}
      />
    </view>
    <ActionButton
      testID="image-cache-path"
      title="getCachePathAsync(key)"
      {color}
      onPress={() => showResult(() => getCachePathAsync(CACHE_KEY), text => (pathLine = text), path => path ?? 'null: not on disk')}
    />
    <ResultRow testID="image-cache-path-result" label="Disk path" value={pathLine} />
    <ActionButton testID="image-prefetch" title="Prefetch 4 gallery photos" {color} onPress={prefetch} />
    <ResultRow testID="image-prefetch-result" label="prefetchImages()" value={prefetchLine} />
    <view class="img-grid">
      {#each GALLERY_URLS as uri (uri)}
        <Image source={uri} class="img-thumb" contentFit="cover" transition={150} />
      {/each}
    </view>
  </Scenario>

  <Scenario
    testID="image-fit-scenario"
    title="Fit one photo into different boxes"
    why="Avatars crop, product photos must show everything, banners stretch. contentFit says how, like CSS object-fit, without extra wrapper views."
    steps={['Compare the five boxes, each holds the same square photo']}
    expect="cover fills the box and crops, contain shows the whole photo with bars, fill stretches it, none keeps the pixel size, scale-down is the smaller of none and contain."
  >
    <view class="img-grid">
      {#each FITS as fit (fit)}
        <view class="img-fit-cell">
          <view class="img-fit-frame">
            <Image testID={`image-fit-${fit}`} source={photoUrl('1025', 200)} contentFit={fit} class="img-fit-image" />
          </view>
          <text class="img-fit-label">{fit}</text>
        </view>
      {/each}
    </view>
  </Scenario>

  <Scenario
    testID="image-error-scenario"
    title="Recover from a broken image"
    why="Links die. onError tells the app, a placeholder keeps the layout, and a retry button fixes it once the link works again."
    steps={['Look at the broken image', 'Press Fix the link']}
    expect="The first load shows an error line and the grey placeholder stays. After Fix the link the real photo loads and the line reports its size."
  >
    {#key errorRound}
      <Image
        testID="image-error-view"
        source={isBroken ? BROKEN_URI : photoUrl('1035', 400)}
        placeholder={{ blurhash: GREY_BLURHASH }}
        class="img-avatar"
        onLoad={event => (errorLine = `loaded: ${describeLoad(event)}`)}
        onError={event => (errorLine = `error: ${event.error}`)}
      />
    {/key}
    <ResultRow testID="image-error-result" label="Event" value={errorLine} />
    <ActionButton
      testID="image-error-fix"
      title={isBroken ? 'Fix the link' : 'Break it again'}
      {color}
      onPress={() => {
        errorLine = 'loading…';
        isBroken = !isBroken;
        errorRound += 1;
      }}
    />
  </Scenario>

  <ImageExtras {color} />
</ScreenShell>
