<script lang="ts">
  import { Platform } from '@symbiote-native/svelte';
  import {
    Image,
    ImageBackground,
    configureCache,
    generateBlurhashAsync,
    generateThumbhashAsync,
    loadImageAsync,
    readFromCacheAsync,
    useImage,
    writeToCacheAsync,
  } from '@symbiote-native/image/svelte';
  import type { IImageContentFit } from '@symbiote-native/image/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Explorer from '../components/Explorer.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { ANIMATED_URI, BLURHASH, GALLERY_URLS, photoUrl } from './image-assets';
  import {
    BLUR_OPTIONS,
    BLURHASH_COMPONENTS,
    CACHE_DISK_BYTES,
    FIT_OPTIONS,
    HASH_PREVIEW_SIZE,
    LOAD_MAX_WIDTH,
    POSITIONS,
    POSITION_OPTIONS,
    WRITTEN_KEY,
    describeRef,
    showResult,
  } from './image-helpers';
  import type { IPosition } from './image-helpers';

  const { color }: { color: string } = $props();
  const IS_IOS = Platform.select({ ios: true, default: false });
  const FAILED_PREFIX = 'failed';
  const LIST_URLS = GALLERY_URLS.concat(GALLERY_URLS);

  type IHandle = {
    startAnimating: () => Promise<void>;
    stopAnimating: () => Promise<void>;
    lockResourceAsync: () => Promise<void>;
    unlockResourceAsync: () => Promise<void>;
    reloadAsync: () => Promise<void>;
  };

  let animatedHandle = $state<IHandle | undefined>();
  let isAutoplay = $state(true);
  let animatedLine = $state('loading…');
  let isLiked = $state(false);

  const image = useImage(() => photoUrl('1044', 400));
  let blurhash = $state<string | null>(null);
  let thumbhash = $state('not generated');

  let playground = $state<IHandle | undefined>();
  let position = $state<IPosition>(POSITIONS[0]);
  let fit = $state<IImageContentFit>('cover');
  let blurRadius = $state(0);
  let isTinted = $state(false);

  function generate(): void {
    const current = image.current;
    if (current === null) {
      thumbhash = 'the photo is still loading';
      return;
    }
    void showResult(() => generateBlurhashAsync(current, BLURHASH_COMPONENTS), text => (blurhash = text), String);
    void showResult(() => generateThumbhashAsync(current), text => (thumbhash = text), hash => `${hash.length} chars`);
  }
</script>

<Scenario
  testID="image-animated-scenario"
  title="Play a GIF or an animated WebP, and pause it"
  why="Stickers, loaders and reactions are animated images. They play on their own, and a screen can pause them to save battery or let the user tap to play."
  steps={['Wait for the globe to spin', 'Press stopAnimating, then startAnimating', 'Turn autoplay off and press Reload']}
  expect="The globe spins, freezes after stopAnimating and spins again after startAnimating. With autoplay off it loads frozen until you start it."
>
  <Image
    bind:this={animatedHandle}
    testID="image-animated"
    source={{ uri: ANIMATED_URI, isAnimated: true }}
    autoplay={isAutoplay}
    contentFit="cover"
    class="img-animated"
    onLoad={event => (animatedLine = `animated: ${String(event.source.isAnimated)}, ${event.source.mediaType ?? 'unknown'}`)}
  />
  <ResultRow testID="image-animated-result" label="onLoad" value={animatedLine} />
  <view class="button-row">
    <ActionButton testID="image-animated-stop" title="stopAnimating" {color} onPress={() => void animatedHandle?.stopAnimating()} />
    <ActionButton testID="image-animated-start" title="startAnimating" {color} onPress={() => void animatedHandle?.startAnimating()} />
    <ActionButton testID="image-animated-reload" title="Reload" {color} onPress={() => void animatedHandle?.reloadAsync()} />
  </view>
  <ToggleRow testID="image-animated-autoplay" label="autoplay" value={isAutoplay} onChange={value => (isAutoplay = value)} {color} />
</Scenario>

<Scenario
  testID="image-sf-scenario"
  title="Use an SF Symbol as an image source (iOS)"
  why="A source like sf:heart.fill draws a system icon with the image pipeline, so it can be tinted, transitioned and animated like any image."
  steps={['Press Toggle and watch the icon swap', 'Look at the tint color']}
  expect="On iOS the icon swaps between an outline and a filled heart with a replace effect, tinted pink. On Android nothing is drawn: SF Symbols do not exist there."
>
  {#if IS_IOS}
    <Image
      testID="image-sf-symbol"
      source={isLiked ? 'sf:heart.fill' : 'sf:heart'}
      tintColor="#ec4899"
      transition={{ effect: 'sf:replace', duration: 300 }}
      sfEffect={isLiked ? 'bounce' : null}
      class="img-symbol"
    />
  {:else}
    <text class="hero-body">SF Symbol sources are iOS only.</text>
  {/if}
  <ActionButton testID="image-sf-toggle" title="Toggle" {color} onPress={() => (isLiked = !isLiked)} />
</Scenario>

<Scenario
  testID="image-list-scenario"
  title="Scroll a long photo list without flicker"
  why="Feeds and galleries reuse rows while scrolling. recyclingKey tells the image view which photo belongs to the row, so a reused row never shows the previous photo, and lazy loading skips rows far off screen."
  steps={['Scroll the list fast up and down', 'Watch the rows as they come into view']}
  expect="Every row shows a colored blur first and its own photo after, never the photo of another row. Rows far from the screen load only when they come near."
>
  <scroll-view testID="image-list" nestedScrollEnabled class="img-list">
    {#each LIST_URLS as uri, index (`${uri}-${String(index)}`)}
      <view class="img-row">
        <Image
          testID={`image-list-row-${String(index)}`}
          source={uri}
          recyclingKey={`row-${String(index)}`}
          placeholder={{ blurhash: BLURHASH }}
          loading="lazy"
          contentFit="cover"
          transition={200}
          class="img-row-photo"
        />
        <text class="capability-label">{`Photo ${String(index + 1)}`}</text>
      </view>
    {/each}
  </scroll-view>
</Scenario>

<Scenario
  testID="image-background-scenario"
  title="Put text on top of a cached photo"
  why="Cards, hero sections and onboarding pages need a picture behind their content. ImageBackground gives the picture the caching and placeholder of the image view."
  steps={['Look at the card']}
  expect="The photo fills the card, the white title sits on top of it at the bottom, and the card keeps its rounded corners."
>
  <ImageBackground
    testID="image-background"
    source={photoUrl('1043', 700)}
    contentFit="cover"
    transition={300}
    class="img-banner"
  >
    <text class="img-banner-text">Weekend in the mountains</text>
  </ImageBackground>
</Scenario>

<Scenario
  testID="image-hash-scenario"
  title="Make a blur preview from a photo the user picked"
  why="Feeds show blur previews from a short hash. When a user uploads a photo the app computes the hash once and sends it with the file, so every viewer gets an instant preview."
  steps={['Wait until the photo is loaded into a native reference', 'Press Generate hashes', 'Compare the small preview with the photo']}
  expect="A blurhash string appears, a thumbhash length is reported, and the small preview below is drawn from the hash alone, with no download."
>
  <ResultRow testID="image-hash-ready" label="useImage()" value={image.current === null ? 'loading…' : `${image.current.width}x${image.current.height} ref ready`} />
  <ActionButton testID="image-hash-generate" title="Generate hashes" {color} onPress={generate} />
  <ResultRow testID="image-blurhash" label="generateBlurhashAsync(4x3)" value={blurhash ?? 'not generated'} />
  <ResultRow testID="image-thumbhash" label="generateThumbhashAsync" value={thumbhash} />
  {#if blurhash !== null && !blurhash.startsWith(FAILED_PREFIX)}
    <Image testID="image-hash-preview" source={{ blurhash, width: HASH_PREVIEW_SIZE, height: HASH_PREVIEW_SIZE }} class="img-hash" />
  {/if}
</Scenario>

<Explorer testID="image-explorer" {color}>
  <Card testID="image-playground" title="Every prop">
    <Image
      bind:this={playground}
      testID="image-playground-view"
      source={photoUrl('1050', 900)}
      contentFit={fit}
      contentPosition={position}
      {blurRadius}
      tintColor={isTinted ? '#f97316' : null}
      priority="high"
      class="img-playground"
    />
    <ChoiceRow testID="image-playground-fit" label="contentFit" {color} value={fit} options={FIT_OPTIONS} onChange={value => (fit = value)} />
    <ChoiceRow testID="image-playground-position" label="contentPosition" {color} value={position} options={POSITION_OPTIONS} onChange={value => (position = value)} />
    <ChoiceRow testID="image-playground-blur" label="blurRadius" {color} value={blurRadius} options={BLUR_OPTIONS} onChange={value => (blurRadius = value)} />
    <ToggleRow testID="image-playground-tint" label="tintColor (orange)" value={isTinted} onChange={value => (isTinted = value)} {color} />
  </Card>
  <CallConsole
    prefix="image-calls"
    title="Cache and loading API"
    {color}
    hint="Write the photo into the cache under a key, read it back, load it into a native reference, lock or reload the playground view."
    calls={[
      { label: 'configureCache (100 MB disk)', run: async () => configureCache({ maxDiskSize: CACHE_DISK_BYTES }) },
      { label: 'writeToCacheAsync', run: () => writeToCacheAsync(photoUrl('1050', 300), WRITTEN_KEY) },
      { label: 'readFromCacheAsync', run: async () => describeRef(await readFromCacheAsync(WRITTEN_KEY)) },
      { label: 'loadImageAsync (maxWidth 64)', run: async () => describeRef(await loadImageAsync(photoUrl('1050', 300), { maxWidth: LOAD_MAX_WIDTH })) },
      { label: 'lockResourceAsync', run: async () => playground?.lockResourceAsync() },
      { label: 'unlockResourceAsync', run: async () => playground?.unlockResourceAsync() },
      { label: 'reloadAsync', run: async () => playground?.reloadAsync() },
    ]}
  />
</Explorer>
