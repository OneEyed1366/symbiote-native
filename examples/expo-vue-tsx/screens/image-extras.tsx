import { defineComponent, ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
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
} from '@symbiote-native/image/vue';
import type { IImageContentFit, IImageViewHandle } from '@symbiote-native/image/vue';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
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

const color = lineColorOf(ROUTE_NAME.Image);
const IS_IOS = Platform.select({ ios: true, default: false });
const FAILED_PREFIX = 'failed';

const AnimatedScenario = defineComponent(
  () => {
    const handle = ref<IImageViewHandle | null>(null);
    const isAutoplay = ref(true);
    const line = ref('loading…');
    return () => (
      <Scenario
        testID="image-animated-scenario"
        title="Play a GIF or an animated WebP, and pause it"
        why="Stickers, loaders and reactions are animated images. They play on their own, and a screen can pause them to save battery or let the user tap to play."
        steps={['Wait for the globe to spin', 'Press stopAnimating, then startAnimating', 'Turn autoplay off and press Reload']}
        expect="The globe spins, freezes after stopAnimating and spins again after startAnimating. With autoplay off it loads frozen until you start it."
      >
        <Image
          testID="image-animated"
          ref={handle}
          source={{ uri: ANIMATED_URI, isAnimated: true }}
          autoplay={isAutoplay.value}
          contentFit="cover"
          class="img-animated"
          onLoad={event => { line.value = `animated: ${String(event.source.isAnimated)}, ${event.source.mediaType ?? 'unknown'}`; }}
        />
        <ResultRow testID="image-animated-result" label="onLoad" value={line.value} />
        <view class="button-row">
          <ActionButton testID="image-animated-stop" title="stopAnimating" color={color} onPress={() => void handle.value?.stopAnimating()} />
          <ActionButton testID="image-animated-start" title="startAnimating" color={color} onPress={() => void handle.value?.startAnimating()} />
          <ActionButton testID="image-animated-reload" title="Reload" color={color} onPress={() => void handle.value?.reloadAsync()} />
        </view>
        <ToggleRow testID="image-animated-autoplay" label="autoplay" value={isAutoplay.value} onChange={value => { isAutoplay.value = value; }} color={color} />
      </Scenario>
    );
  },
  { name: 'AnimatedScenario' },
);

const SymbolScenario = defineComponent(
  () => {
    const isLiked = ref(false);
    return () => (
      <Scenario
        testID="image-sf-scenario"
        title="Use an SF Symbol as an image source (iOS)"
        why="A source like sf:heart.fill draws a system icon with the image pipeline, so it can be tinted, transitioned and animated like any image."
        steps={['Press Toggle and watch the icon swap', 'Look at the tint color']}
        expect="On iOS the icon swaps between an outline and a filled heart with a replace effect, tinted pink. On Android nothing is drawn: SF Symbols do not exist there."
      >
        {IS_IOS ? (
          <Image
            testID="image-sf-symbol"
            source={isLiked.value ? 'sf:heart.fill' : 'sf:heart'}
            tintColor="#ec4899"
            transition={{ effect: 'sf:replace', duration: 300 }}
            sfEffect={isLiked.value ? 'bounce' : null}
            class="img-symbol"
          />
        ) : (
          <text class="hero-body">SF Symbol sources are iOS only.</text>
        )}
        <ActionButton testID="image-sf-toggle" title="Toggle" color={color} onPress={() => { isLiked.value = !isLiked.value; }} />
      </Scenario>
    );
  },
  { name: 'SymbolScenario' },
);

const FeedListScenario = defineComponent(
  () => () => (
    <Scenario
      testID="image-list-scenario"
      title="Scroll a long photo list without flicker"
      why="Feeds and galleries reuse rows while scrolling. recyclingKey tells the image view which photo belongs to the row, so a reused row never shows the previous photo, and lazy loading skips rows far off screen."
      steps={['Scroll the list fast up and down', 'Watch the rows as they come into view']}
      expect="Every row shows a colored blur first and its own photo after, never the photo of another row. Rows far from the screen load only when they come near."
    >
      <scroll-view testID="image-list" nestedScrollEnabled class="img-list">
        {GALLERY_URLS.concat(GALLERY_URLS).map((uri, index) => (
          <view key={`${uri}-${String(index)}`} class="img-row">
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
        ))}
      </scroll-view>
    </Scenario>
  ),
  { name: 'FeedListScenario' },
);

const BackgroundScenario = defineComponent(
  () => () => (
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
  ),
  { name: 'BackgroundScenario' },
);

const HashScenario = defineComponent(
  () => {
    const image = useImage(photoUrl('1044', 400));
    const blurhash = ref<string | null>(null);
    const thumbhash = ref('not generated');
    const setBlurhash = (text: string) => {
      blurhash.value = text;
    };
    const setThumbhash = (text: string) => {
      thumbhash.value = text;
    };
    const generate = () => {
      const current = image.value;
      if (current === null) {
        thumbhash.value = 'the photo is still loading';
        return;
      }
      void showResult(() => generateBlurhashAsync(current, BLURHASH_COMPONENTS), setBlurhash, String);
      void showResult(() => generateThumbhashAsync(current), setThumbhash, hash => `${hash.length} chars`);
    };
    return () => (
      <Scenario
        testID="image-hash-scenario"
        title="Make a blur preview from a photo the user picked"
        why="Feeds show blur previews from a short hash. When a user uploads a photo the app computes the hash once and sends it with the file, so every viewer gets an instant preview."
        steps={['Wait until the photo is loaded into a native reference', 'Press Generate hashes', 'Compare the small preview with the photo']}
        expect="A blurhash string appears, a thumbhash length is reported, and the small preview below is drawn from the hash alone, with no download."
      >
        <ResultRow testID="image-hash-ready" label="useImage()" value={image.value === null ? 'loading…' : `${image.value.width}x${image.value.height} ref ready`} />
        <ActionButton testID="image-hash-generate" title="Generate hashes" color={color} onPress={generate} />
        <ResultRow testID="image-blurhash" label="generateBlurhashAsync(4x3)" value={blurhash.value ?? 'not generated'} />
        <ResultRow testID="image-thumbhash" label="generateThumbhashAsync" value={thumbhash.value} />
        {blurhash.value !== null && !blurhash.value.startsWith(FAILED_PREFIX) && (
          <Image testID="image-hash-preview" source={{ blurhash: blurhash.value, width: HASH_PREVIEW_SIZE, height: HASH_PREVIEW_SIZE }} class="img-hash" />
        )}
      </Scenario>
    );
  },
  { name: 'HashScenario' },
);

export const ImageExtras = defineComponent(
  () => {
    const playground = ref<IImageViewHandle | null>(null);
    const position = ref<IPosition>(POSITIONS[0]);
    const fit = ref<IImageContentFit>('cover');
    const blurRadius = ref(0);
    const isTinted = ref(false);
    return () => (
      <>
        <AnimatedScenario />
        <SymbolScenario />
        <FeedListScenario />
        <BackgroundScenario />
        <HashScenario />
        <Explorer testID="image-explorer" color={color}>
          <Card testID="image-playground" title="Every prop">
            <Image
              testID="image-playground-view"
              ref={playground}
              source={photoUrl('1050', 900)}
              contentFit={fit.value}
              contentPosition={position.value}
              blurRadius={blurRadius.value}
              tintColor={isTinted.value ? '#f97316' : null}
              priority="high"
              class="img-playground"
            />
            <ChoiceRow testID="image-playground-fit" label="contentFit" color={color} value={fit.value} options={FIT_OPTIONS} onChange={value => { fit.value = value; }} />
            <ChoiceRow testID="image-playground-position" label="contentPosition" color={color} value={position.value} options={POSITION_OPTIONS} onChange={value => { position.value = value; }} />
            <ChoiceRow testID="image-playground-blur" label="blurRadius" color={color} value={blurRadius.value} options={BLUR_OPTIONS} onChange={value => { blurRadius.value = value; }} />
            <ToggleRow testID="image-playground-tint" label="tintColor (orange)" value={isTinted.value} onChange={value => { isTinted.value = value; }} color={color} />
          </Card>
          <CallConsole
            prefix="image-calls"
            title="Cache and loading API"
            color={color}
            hint="Write the photo into the cache under a key, read it back, load it into a native reference, lock or reload the playground view."
            calls={[
              { label: 'configureCache (100 MB disk)', run: async () => configureCache({ maxDiskSize: CACHE_DISK_BYTES }) },
              { label: 'writeToCacheAsync', run: () => writeToCacheAsync(photoUrl('1050', 300), WRITTEN_KEY) },
              { label: 'readFromCacheAsync', run: async () => describeRef(await readFromCacheAsync(WRITTEN_KEY)) },
              { label: 'loadImageAsync (maxWidth 64)', run: async () => describeRef(await loadImageAsync(photoUrl('1050', 300), { maxWidth: LOAD_MAX_WIDTH })) },
              { label: 'lockResourceAsync', run: async () => playground.value?.lockResourceAsync() },
              { label: 'unlockResourceAsync', run: async () => playground.value?.unlockResourceAsync() },
              { label: 'reloadAsync', run: async () => playground.value?.reloadAsync() },
            ]}
          />
        </Explorer>
      </>
    );
  },
  { name: 'ImageExtras' },
);
