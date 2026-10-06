<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Image,
  clearDiskCache,
  clearMemoryCache,
  getCachePathAsync,
  prefetchImages,
} from '@symbiote-native/image/vue';
import type { IImageViewHandle } from '@symbiote-native/image/vue';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { BLURHASH, GALLERY_URLS, GREY_BLURHASH, photoUrl } from './image-assets';
import ImageExtras from './ImageExtras.vue';
import { BROKEN_URI, CACHE_KEY, FITS, describeLoad, showResult } from './image-helpers';

const ROUTE = ROUTE_NAME.Image;
const color = lineColorOf(ROUTE);
const BLURHASH_PLACEHOLDER = { blurhash: BLURHASH };
const GREY_PLACEHOLDER = { blurhash: GREY_BLURHASH };
const CACHE_SOURCE = { uri: photoUrl('1011', 500), cacheKey: CACHE_KEY };
const FIT_SOURCE = photoUrl('1025', 200);

const heroLine = ref('loading…');
const heroRound = ref(0);
const heroSource = computed(() => ({ uri: `${photoUrl('1018', 800)}?round=${heroRound.value}` }));

const cacheRound = ref(0);
const cacheLine = ref('not loaded yet');
const pathLine = ref('unknown');
const prefetchLine = ref('not prefetched');
const cacheHandle = ref<IImageViewHandle | null>(null);

const errorRound = ref(0);
const isBroken = ref(true);
const errorLine = ref('loading…');
const errorSource = computed(() => (isBroken.value ? BROKEN_URI : photoUrl('1035', 400)));
const errorTitle = computed(() => (isBroken.value ? 'Fix the link' : 'Break it again'));

function reloadHero(): void {
  heroLine.value = 'loading…';
  heroRound.value += 1;
}

function remount(): void {
  cacheLine.value = 'loading…';
  cacheRound.value += 1;
}

function clearAll(): Promise<unknown> {
  return Promise.all([clearMemoryCache(), clearDiskCache()]);
}

function showPath(): Promise<void> {
  return showResult(() => getCachePathAsync(CACHE_KEY), text => (pathLine.value = text), path => path ?? 'null: not on disk');
}

function prefetch(): Promise<void> {
  prefetchLine.value = 'prefetching…';
  return showResult(() => prefetchImages(GALLERY_URLS), text => (prefetchLine.value = text), String);
}

function fixLink(): void {
  errorLine.value = 'loading…';
  isBroken.value = !isBroken.value;
  errorRound.value += 1;
}
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="image-scroll"
    title="Image"
    body="expo-image: the fast image view with disk and memory cache, placeholders, transitions and content fit, plus the cache API and animated images."
  >
    <Scenario
      testID="image-smooth-scenario"
      title="Show a feed photo without a blank flash"
      why="Feeds and profiles show a blurred preview from a 28 character hash while the real photo downloads, then fade it in. Nothing jumps and no layout shifts."
      :steps="['Press Load again, with the network on', 'Watch the area while the photo downloads']"
      expect="A colored blur appears at once, then the photo fades in over 400 ms. The line below reports the load result with its size and type."
    >
      <Image
        :key="heroRound"
        testID="image-hero"
        :source="heroSource"
        :placeholder="BLURHASH_PLACEHOLDER"
        contentFit="cover"
        :transition="400"
        class="img-hero"
        accessibilityLabel="Mountain lake at dawn"
        @load="event => (heroLine = describeLoad(event))"
        @error="event => (heroLine = `error: ${event.error}`)"
      />
      <ResultRow
        testID="image-hero-result"
        label="onLoad"
        :value="heroLine"
      />
      <ActionButton
        testID="image-hero-reload"
        title="Load again (new url)"
        :color="color"
        @press="reloadHero"
      />
    </Scenario>

    <Scenario
      testID="image-cache-scenario"
      title="Make a screen open instantly the second time"
      why="Images are cached in memory and on disk. Prefetching warms the cache before a gallery opens, and clearing it frees space or forces a fresh download."
      :steps="[
        'Press Remount: the first load reports cache none',
        'Press Remount again: it reports memory',
        'Press Clear memory, then Remount: it reports disk',
        'Press Clear memory and disk, then Remount: it reports none again',
      ]"
      expect="The cache type moves none, memory, disk, none as described. Prefetch says true and the path button shows a file path after the first load."
    >
      <Image
        ref="cacheHandle"
        :key="cacheRound"
        testID="image-cache-view"
        :source="CACHE_SOURCE"
        cachePolicy="memory-disk"
        class="img-avatar"
        @load="event => (cacheLine = describeLoad(event))"
      />
      <ResultRow
        testID="image-cache-result"
        label="onLoad"
        :value="cacheLine"
      />
      <view class="button-row">
        <ActionButton
          testID="image-cache-remount"
          title="Remount"
          :color="color"
          @press="remount"
        />
        <ActionButton
          testID="image-cache-reload"
          title="reloadAsync()"
          :color="color"
          @press="cacheHandle?.reloadAsync()"
        />
      </view>
      <view class="button-row">
        <ActionButton
          testID="image-cache-clear-memory"
          title="Clear memory"
          :color="color"
          @press="clearMemoryCache()"
        />
        <ActionButton
          testID="image-cache-clear-all"
          title="Clear memory and disk"
          :color="color"
          @press="clearAll"
        />
      </view>
      <ActionButton
        testID="image-cache-path"
        title="getCachePathAsync(key)"
        :color="color"
        @press="showPath"
      />
      <ResultRow
        testID="image-cache-path-result"
        label="Disk path"
        :value="pathLine"
      />
      <ActionButton
        testID="image-prefetch"
        title="Prefetch 4 gallery photos"
        :color="color"
        @press="prefetch"
      />
      <ResultRow
        testID="image-prefetch-result"
        label="prefetchImages()"
        :value="prefetchLine"
      />
      <view class="img-grid">
        <Image
          v-for="uri in GALLERY_URLS"
          :key="uri"
          :source="uri"
          class="img-thumb"
          contentFit="cover"
          :transition="150"
        />
      </view>
    </Scenario>

    <Scenario
      testID="image-fit-scenario"
      title="Fit one photo into different boxes"
      why="Avatars crop, product photos must show everything, banners stretch. contentFit says how, like CSS object-fit, without extra wrapper views."
      :steps="['Compare the five boxes, each holds the same square photo']"
      expect="cover fills the box and crops, contain shows the whole photo with bars, fill stretches it, none keeps the pixel size, scale-down is the smaller of none and contain."
    >
      <view class="img-grid">
        <view
          v-for="fit in FITS"
          :key="fit"
          class="img-fit-cell"
        >
          <view class="img-fit-frame">
            <Image
              :testID="`image-fit-${fit}`"
              :source="FIT_SOURCE"
              :contentFit="fit"
              class="img-fit-image"
            />
          </view>
          <text class="img-fit-label">
            {{ fit }}
          </text>
        </view>
      </view>
    </Scenario>

    <Scenario
      testID="image-error-scenario"
      title="Recover from a broken image"
      why="Links die. onError tells the app, a placeholder keeps the layout, and a retry button fixes it once the link works again."
      :steps="['Look at the broken image', 'Press Fix the link']"
      expect="The first load shows an error line and the grey placeholder stays. After Fix the link the real photo loads and the line reports its size."
    >
      <Image
        :key="errorRound"
        testID="image-error-view"
        :source="errorSource"
        :placeholder="GREY_PLACEHOLDER"
        class="img-avatar"
        @load="event => (errorLine = `loaded: ${describeLoad(event)}`)"
        @error="event => (errorLine = `error: ${event.error}`)"
      />
      <ResultRow
        testID="image-error-result"
        label="Event"
        :value="errorLine"
      />
      <ActionButton
        testID="image-error-fix"
        :title="errorTitle"
        :color="color"
        @press="fixLink"
      />
    </Scenario>

    <ImageExtras :color="color" />
  </ScreenShell>
</template>
