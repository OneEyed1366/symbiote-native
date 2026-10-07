<script setup lang="ts">
import { computed, ref } from 'vue';
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
import ActionButton from '../components/ActionButton.vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Explorer from '../components/Explorer.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ToggleRow from '../components/ToggleRow.vue';
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

defineProps<{ color: string }>();

const IS_IOS = Platform.select({ ios: true, default: false });
const FAILED_PREFIX = 'failed';
const LIST_ROWS = GALLERY_URLS.concat(GALLERY_URLS).map((uri, index) => ({
  uri,
  index,
  key: `${uri}-${String(index)}`,
  testID: `image-list-row-${String(index)}`,
  recyclingKey: `row-${String(index)}`,
  caption: `Photo ${String(index + 1)}`,
}));
const ANIMATED_SOURCE = { uri: ANIMATED_URI, isAnimated: true };
const BLURHASH_PLACEHOLDER = { blurhash: BLURHASH };
const SF_TRANSITION = { effect: 'sf:replace', duration: 300 } as const;
const BANNER_SOURCE = photoUrl('1043', 700);
const PLAYGROUND_SOURCE = photoUrl('1050', 900);

const animatedHandle = ref<IImageViewHandle | null>(null);
const isAutoplay = ref(true);
const animatedLine = ref('loading…');
const isLiked = ref(false);
const heartSource = computed(() => (isLiked.value ? 'sf:heart.fill' : 'sf:heart'));
const heartEffect = computed(() => (isLiked.value ? 'bounce' : null));

const image = useImage(photoUrl('1044', 400));
const blurhash = ref<string | null>(null);
const thumbhash = ref('not generated');
const hashReady = computed(() => (image.value === null ? 'loading…' : `${image.value.width}x${image.value.height} ref ready`));
const hashPreview = computed(() =>
  blurhash.value !== null && !blurhash.value.startsWith(FAILED_PREFIX)
    ? { blurhash: blurhash.value, width: HASH_PREVIEW_SIZE, height: HASH_PREVIEW_SIZE }
    : null,
);

const playground = ref<IImageViewHandle | null>(null);
const position = ref<IPosition>(POSITIONS[0]);
const fit = ref<IImageContentFit>('cover');
const blurRadius = ref(0);
const isTinted = ref(false);
const playgroundTint = computed(() => (isTinted.value ? '#f97316' : null));

const calls = [
  { label: 'configureCache (100 MB disk)', run: async () => configureCache({ maxDiskSize: CACHE_DISK_BYTES }) },
  { label: 'writeToCacheAsync', run: () => writeToCacheAsync(photoUrl('1050', 300), WRITTEN_KEY) },
  { label: 'readFromCacheAsync', run: async () => describeRef(await readFromCacheAsync(WRITTEN_KEY)) },
  { label: 'loadImageAsync (maxWidth 64)', run: async () => describeRef(await loadImageAsync(photoUrl('1050', 300), { maxWidth: LOAD_MAX_WIDTH })) },
  { label: 'lockResourceAsync', run: async () => playground.value?.lockResourceAsync() },
  { label: 'unlockResourceAsync', run: async () => playground.value?.unlockResourceAsync() },
  { label: 'reloadAsync', run: async () => playground.value?.reloadAsync() },
];

function generate(): void {
  const current = image.value;
  if (current === null) {
    thumbhash.value = 'the photo is still loading';
    return;
  }
  void showResult(() => generateBlurhashAsync(current, BLURHASH_COMPONENTS), text => (blurhash.value = text), String);
  void showResult(() => generateThumbhashAsync(current), text => (thumbhash.value = text), hash => `${hash.length} chars`);
}
</script>

<template>
  <Scenario
    testID="image-animated-scenario"
    title="Play a GIF or an animated WebP, and pause it"
    why="Stickers, loaders and reactions are animated images. They play on their own, and a screen can pause them to save battery or let the user tap to play."
    :steps="['Wait for the globe to spin', 'Press stopAnimating, then startAnimating', 'Turn autoplay off and press Reload']"
    expect="The globe spins, freezes after stopAnimating and spins again after startAnimating. With autoplay off it loads frozen until you start it."
  >
    <Image
      ref="animatedHandle"
      testID="image-animated"
      :source="ANIMATED_SOURCE"
      :autoplay="isAutoplay"
      contentFit="cover"
      class="img-animated"
      @load="event => (animatedLine = `animated: ${String(event.source.isAnimated)}, ${event.source.mediaType ?? 'unknown'}`)"
    />
    <ResultRow
      testID="image-animated-result"
      label="onLoad"
      :value="animatedLine"
    />
    <view class="button-row">
      <ActionButton
        testID="image-animated-stop"
        title="stopAnimating"
        :color="color"
        @press="animatedHandle?.stopAnimating()"
      />
      <ActionButton
        testID="image-animated-start"
        title="startAnimating"
        :color="color"
        @press="animatedHandle?.startAnimating()"
      />
      <ActionButton
        testID="image-animated-reload"
        title="Reload"
        :color="color"
        @press="animatedHandle?.reloadAsync()"
      />
    </view>
    <ToggleRow
      testID="image-animated-autoplay"
      label="autoplay"
      :value="isAutoplay"
      :color="color"
      @change="value => (isAutoplay = value)"
    />
  </Scenario>

  <Scenario
    testID="image-sf-scenario"
    title="Use an SF Symbol as an image source (iOS)"
    why="A source like sf:heart.fill draws a system icon with the image pipeline, so it can be tinted, transitioned and animated like any image."
    :steps="['Press Toggle and watch the icon swap', 'Look at the tint color']"
    expect="On iOS the icon swaps between an outline and a filled heart with a replace effect, tinted pink. On Android nothing is drawn: SF Symbols do not exist there."
  >
    <Image
      v-if="IS_IOS"
      testID="image-sf-symbol"
      :source="heartSource"
      tintColor="#ec4899"
      :transition="SF_TRANSITION"
      :sfEffect="heartEffect"
      class="img-symbol"
    />
    <text
      v-else
      class="hero-body"
    >
      SF Symbol sources are iOS only.
    </text>
    <ActionButton
      testID="image-sf-toggle"
      title="Toggle"
      :color="color"
      @press="isLiked = !isLiked"
    />
  </Scenario>

  <Scenario
    testID="image-list-scenario"
    title="Scroll a long photo list without flicker"
    why="Feeds and galleries reuse rows while scrolling. recyclingKey tells the image view which photo belongs to the row, so a reused row never shows the previous photo, and lazy loading skips rows far off screen."
    :steps="['Scroll the list fast up and down', 'Watch the rows as they come into view']"
    expect="Every row shows a colored blur first and its own photo after, never the photo of another row. Rows far from the screen load only when they come near."
  >
    <scroll-view
      testID="image-list"
      :nestedScrollEnabled="true"
      class="img-list"
    >
      <view
        v-for="row in LIST_ROWS"
        :key="row.key"
        class="img-row"
      >
        <Image
          :testID="row.testID"
          :source="row.uri"
          :recyclingKey="row.recyclingKey"
          :placeholder="BLURHASH_PLACEHOLDER"
          loading="lazy"
          contentFit="cover"
          :transition="200"
          class="img-row-photo"
        />
        <text class="capability-label">
          {{ row.caption }}
        </text>
      </view>
    </scroll-view>
  </Scenario>

  <Scenario
    testID="image-background-scenario"
    title="Put text on top of a cached photo"
    why="Cards, hero sections and onboarding pages need a picture behind their content. ImageBackground gives the picture the caching and placeholder of the image view."
    :steps="['Look at the card']"
    expect="The photo fills the card, the white title sits on top of it at the bottom, and the card keeps its rounded corners."
  >
    <ImageBackground
      testID="image-background"
      :source="BANNER_SOURCE"
      contentFit="cover"
      :transition="300"
      class="img-banner"
    >
      <text class="img-banner-text">
        Weekend in the mountains
      </text>
    </ImageBackground>
  </Scenario>

  <Scenario
    testID="image-hash-scenario"
    title="Make a blur preview from a photo the user picked"
    why="Feeds show blur previews from a short hash. When a user uploads a photo the app computes the hash once and sends it with the file, so every viewer gets an instant preview."
    :steps="['Wait until the photo is loaded into a native reference', 'Press Generate hashes', 'Compare the small preview with the photo']"
    expect="A blurhash string appears, a thumbhash length is reported, and the small preview below is drawn from the hash alone, with no download."
  >
    <ResultRow
      testID="image-hash-ready"
      label="useImage()"
      :value="hashReady"
    />
    <ActionButton
      testID="image-hash-generate"
      title="Generate hashes"
      :color="color"
      @press="generate"
    />
    <ResultRow
      testID="image-blurhash"
      label="generateBlurhashAsync(4x3)"
      :value="blurhash ?? 'not generated'"
    />
    <ResultRow
      testID="image-thumbhash"
      label="generateThumbhashAsync"
      :value="thumbhash"
    />
    <Image
      v-if="hashPreview !== null"
      testID="image-hash-preview"
      :source="hashPreview"
      class="img-hash"
    />
  </Scenario>

  <Explorer
    testID="image-explorer"
    :color="color"
  >
    <Card
      testID="image-playground"
      title="Every prop"
    >
      <Image
        ref="playground"
        testID="image-playground-view"
        :source="PLAYGROUND_SOURCE"
        :contentFit="fit"
        :contentPosition="position"
        :blurRadius="blurRadius"
        :tintColor="playgroundTint"
        priority="high"
        class="img-playground"
      />
      <ChoiceRow
        testID="image-playground-fit"
        label="contentFit"
        :color="color"
        :value="fit"
        :options="FIT_OPTIONS"
        @change="value => (fit = value)"
      />
      <ChoiceRow
        testID="image-playground-position"
        label="contentPosition"
        :color="color"
        :value="position"
        :options="POSITION_OPTIONS"
        @change="value => (position = value)"
      />
      <ChoiceRow
        testID="image-playground-blur"
        label="blurRadius"
        :color="color"
        :value="blurRadius"
        :options="BLUR_OPTIONS"
        @change="value => (blurRadius = value)"
      />
      <ToggleRow
        testID="image-playground-tint"
        label="tintColor (orange)"
        :value="isTinted"
        :color="color"
        @change="value => (isTinted = value)"
      />
    </Card>
    <CallConsole
      prefix="image-calls"
      title="Cache and loading API"
      :color="color"
      hint="Write the photo into the cache under a key, read it back, load it into a native reference, lock or reload the playground view."
      :calls="calls"
    />
  </Explorer>
</template>
