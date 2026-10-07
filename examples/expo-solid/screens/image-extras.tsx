import { For, Show, createSignal } from 'solid-js';
import { Platform } from '@symbiote-native/solid';
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
} from '@symbiote-native/image/solid';
import type { IImageContentFit, IImageViewHandle } from '@symbiote-native/image/solid';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ToggleRow } from '../components/ScreenShell';
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

const IS_IOS = Platform.select({ ios: true, default: false });
const FAILED_PREFIX = 'failed';

function AnimatedScenario(props: { color: string }) {
  const [handle, setHandle] = createSignal<IImageViewHandle>();
  const [isAutoplay, setIsAutoplay] = createSignal(true);
  const [line, setLine] = createSignal('loading…');
  return (
    <Scenario
      testID="image-animated-scenario"
      title="Play a GIF or an animated WebP, and pause it"
      why="Stickers, loaders and reactions are animated images. They play on their own, and a screen can pause them to save battery or let the user tap to play."
      steps={['Wait for the globe to spin', 'Press stopAnimating, then startAnimating', 'Turn autoplay off and press Reload']}
      expect="The globe spins, freezes after stopAnimating and spins again after startAnimating. With autoplay off it loads frozen until you start it."
    >
      <Image
        testID="image-animated"
        ref={setHandle}
        source={{ uri: ANIMATED_URI, isAnimated: true }}
        autoplay={isAutoplay()}
        contentFit="cover"
        class="img-animated"
        onLoad={event => setLine(`animated: ${String(event.source.isAnimated)}, ${event.source.mediaType ?? 'unknown'}`)}
      />
      <ResultRow testID="image-animated-result" label="onLoad" value={line()} />
      <view class="button-row">
        <ActionButton testID="image-animated-stop" title="stopAnimating" color={props.color} onPress={() => void handle()?.stopAnimating()} />
        <ActionButton testID="image-animated-start" title="startAnimating" color={props.color} onPress={() => void handle()?.startAnimating()} />
        <ActionButton testID="image-animated-reload" title="Reload" color={props.color} onPress={() => void handle()?.reloadAsync()} />
      </view>
      <ToggleRow testID="image-animated-autoplay" label="autoplay" value={isAutoplay()} onChange={setIsAutoplay} color={props.color} />
    </Scenario>
  );
}

function SymbolScenario(props: { color: string }) {
  const [isLiked, setIsLiked] = createSignal(false);
  return (
    <Scenario
      testID="image-sf-scenario"
      title="Use an SF Symbol as an image source (iOS)"
      why="A source like sf:heart.fill draws a system icon with the image pipeline, so it can be tinted, transitioned and animated like any image."
      steps={['Press Toggle and watch the icon swap', 'Look at the tint color']}
      expect="On iOS the icon swaps between an outline and a filled heart with a replace effect, tinted pink. On Android nothing is drawn: SF Symbols do not exist there."
    >
      <Show when={IS_IOS} fallback={<text class="hero-body">SF Symbol sources are iOS only.</text>}>
        <Image
          testID="image-sf-symbol"
          source={isLiked() ? 'sf:heart.fill' : 'sf:heart'}
          tintColor="#ec4899"
          transition={{ effect: 'sf:replace', duration: 300 }}
          sfEffect={isLiked() ? 'bounce' : null}
          class="img-symbol"
        />
      </Show>
      <ActionButton testID="image-sf-toggle" title="Toggle" color={props.color} onPress={() => setIsLiked(value => !value)} />
    </Scenario>
  );
}

function FeedListScenario() {
  return (
    <Scenario
      testID="image-list-scenario"
      title="Scroll a long photo list without flicker"
      why="Feeds and galleries reuse rows while scrolling. recyclingKey tells the image view which photo belongs to the row, so a reused row never shows the previous photo, and lazy loading skips rows far off screen."
      steps={['Scroll the list fast up and down', 'Watch the rows as they come into view']}
      expect="Every row shows a colored blur first and its own photo after, never the photo of another row. Rows far from the screen load only when they come near."
    >
      <scroll-view testID="image-list" nestedScrollEnabled class="img-list">
        <For each={GALLERY_URLS.concat(GALLERY_URLS)}>
          {(uri, index) => (
            <view class="img-row">
              <Image
                testID={`image-list-row-${String(index())}`}
                source={uri}
                recyclingKey={`row-${String(index())}`}
                placeholder={{ blurhash: BLURHASH }}
                loading="lazy"
                contentFit="cover"
                transition={200}
                class="img-row-photo"
              />
              <text class="capability-label">{`Photo ${String(index() + 1)}`}</text>
            </view>
          )}
        </For>
      </scroll-view>
    </Scenario>
  );
}

function BackgroundScenario() {
  return (
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
  );
}

function HashScenario(props: { color: string }) {
  const image = useImage(() => photoUrl('1044', 400));
  const [blurhash, setBlurhash] = createSignal<string | null>(null);
  const [thumbhash, setThumbhash] = createSignal('not generated');
  const generate = () => {
    const current = image();
    if (current === null) {
      setThumbhash('the photo is still loading');
      return;
    }
    void showResult(() => generateBlurhashAsync(current, BLURHASH_COMPONENTS), text => setBlurhash(text), String);
    void showResult(() => generateThumbhashAsync(current), setThumbhash, hash => `${hash.length} chars`);
  };
  return (
    <Scenario
      testID="image-hash-scenario"
      title="Make a blur preview from a photo the user picked"
      why="Feeds show blur previews from a short hash. When a user uploads a photo the app computes the hash once and sends it with the file, so every viewer gets an instant preview."
      steps={['Wait until the photo is loaded into a native reference', 'Press Generate hashes', 'Compare the small preview with the photo']}
      expect="A blurhash string appears, a thumbhash length is reported, and the small preview below is drawn from the hash alone, with no download."
    >
      <ResultRow testID="image-hash-ready" label="useImage()" value={image() === null ? 'loading…' : `${image()?.width}x${image()?.height} ref ready`} />
      <ActionButton testID="image-hash-generate" title="Generate hashes" color={props.color} onPress={generate} />
      <ResultRow testID="image-blurhash" label="generateBlurhashAsync(4x3)" value={blurhash() ?? 'not generated'} />
      <ResultRow testID="image-thumbhash" label="generateThumbhashAsync" value={thumbhash()} />
      <Show when={blurhash()}>
        {hash => (
          <Show when={!hash().startsWith(FAILED_PREFIX)}>
            <Image testID="image-hash-preview" source={{ blurhash: hash(), width: HASH_PREVIEW_SIZE, height: HASH_PREVIEW_SIZE }} class="img-hash" />
          </Show>
        )}
      </Show>
    </Scenario>
  );
}

export function ImageExtras(props: { color: string }) {
  const [playground, setPlayground] = createSignal<IImageViewHandle>();
  const [position, setPosition] = createSignal<IPosition>(POSITIONS[0]);
  const [fit, setFit] = createSignal<IImageContentFit>('cover');
  const [blurRadius, setBlurRadius] = createSignal(0);
  const [isTinted, setIsTinted] = createSignal(false);
  return (
    <>
      <AnimatedScenario color={props.color} />
      <SymbolScenario color={props.color} />
      <FeedListScenario />
      <BackgroundScenario />
      <HashScenario color={props.color} />
      <Explorer testID="image-explorer" color={props.color}>
        <Card testID="image-playground" title="Every prop">
          <Image
            testID="image-playground-view"
            ref={setPlayground}
            source={photoUrl('1050', 900)}
            contentFit={fit()}
            contentPosition={position()}
            blurRadius={blurRadius()}
            tintColor={isTinted() ? '#f97316' : null}
            priority="high"
            class="img-playground"
          />
          <ChoiceRow testID="image-playground-fit" label="contentFit" color={props.color} value={fit()} options={FIT_OPTIONS} onChange={setFit} />
          <ChoiceRow testID="image-playground-position" label="contentPosition" color={props.color} value={position()} options={POSITION_OPTIONS} onChange={setPosition} />
          <ChoiceRow testID="image-playground-blur" label="blurRadius" color={props.color} value={blurRadius()} options={BLUR_OPTIONS} onChange={setBlurRadius} />
          <ToggleRow testID="image-playground-tint" label="tintColor (orange)" value={isTinted()} onChange={setIsTinted} color={props.color} />
        </Card>
        <CallConsole
          prefix="image-calls"
          title="Cache and loading API"
          color={props.color}
          hint="Write the photo into the cache under a key, read it back, load it into a native reference, lock or reload the playground view."
          calls={[
            { label: 'configureCache (100 MB disk)', run: async () => configureCache({ maxDiskSize: CACHE_DISK_BYTES }) },
            { label: 'writeToCacheAsync', run: () => writeToCacheAsync(photoUrl('1050', 300), WRITTEN_KEY) },
            { label: 'readFromCacheAsync', run: async () => describeRef(await readFromCacheAsync(WRITTEN_KEY)) },
            { label: 'loadImageAsync (maxWidth 64)', run: async () => describeRef(await loadImageAsync(photoUrl('1050', 300), { maxWidth: LOAD_MAX_WIDTH })) },
            { label: 'lockResourceAsync', run: async () => playground()?.lockResourceAsync() },
            { label: 'unlockResourceAsync', run: async () => playground()?.unlockResourceAsync() },
            { label: 'reloadAsync', run: async () => playground()?.reloadAsync() },
          ]}
        />
      </Explorer>
    </>
  );
}
