import { Component, computed, signal, viewChild } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  ExpoImage,
  clearDiskCache,
  clearMemoryCache,
  getCachePathAsync,
  prefetchImages,
} from '@symbiote-native/image/angular';
import type { IImageLoadEventData } from '@symbiote-native/image/angular';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import {
  BLURHASH,
  GALLERY_URLS,
  GREY_BLURHASH,
  photoUrl,
} from './image-assets';
import { ImageExtras } from './image-extras';
import {
  BROKEN_URI,
  CACHE_KEY,
  FITS,
  describeLoad,
  showResult,
} from './image-helpers';

const ROUTE = ROUTE_NAME.Image;

@Component({
  selector: 'ImageScreen',
  standalone: true,
  imports: [
    ActionButton,
    ExpoImage,
    ImageExtras,
    ResultRow,
    Scenario,
    ScreenShell,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="image-scroll"
      title="Image"
      body="expo-image: the fast image view with disk and memory cache, placeholders, transitions and content fit, plus the cache API and animated images."
    >
      <Scenario
        testID="image-smooth-scenario"
        title="Show a feed photo without a blank flash"
        why="Feeds and profiles show a blurred preview from a 28 character hash while the real photo downloads, then fade it in. Nothing jumps and no layout shifts."
        [steps]="smoothSteps"
        expect="A colored blur appears at once, then the photo fades in over 400 ms. The line below reports the load result with its size and type."
      >
        @for (round of heroRounds(); track round) {
          <ExpoImage
            testID="image-hero"
            [source]="heroSource()"
            [placeholder]="blurhashPlaceholder"
            contentFit="cover"
            [transition]="400"
            class="img-hero"
            [onLoad]="onHeroLoad"
            [onError]="onHeroError"
            accessibilityLabel="Mountain lake at dawn"
          />
        }
        <ResultRow
          testID="image-hero-result"
          label="onLoad"
          [value]="heroLine()"
        />
        <ActionButton
          testID="image-hero-reload"
          title="Load again (new url)"
          [color]="color"
          (press)="reloadHero()"
        />
      </Scenario>

      <Scenario
        testID="image-cache-scenario"
        title="Make a screen open instantly the second time"
        why="Images are cached in memory and on disk. Prefetching warms the cache before a gallery opens, and clearing it frees space or forces a fresh download."
        [steps]="cacheSteps"
        expect="The cache type moves none, memory, disk, none as described. Prefetch says true and the path button shows a file path after the first load."
      >
        @for (round of cacheRounds(); track round) {
          <ExpoImage
            #cacheHandle
            testID="image-cache-view"
            [source]="cacheSource"
            cachePolicy="memory-disk"
            class="img-avatar"
            [onLoad]="onCacheLoad"
          />
        }
        <ResultRow
          testID="image-cache-result"
          label="onLoad"
          [value]="cacheLine()"
        />
        <view class="button-row">
          <ActionButton
            testID="image-cache-remount"
            title="Remount"
            [color]="color"
            (press)="remount()"
          />
          <ActionButton
            testID="image-cache-reload"
            title="reloadAsync()"
            [color]="color"
            (press)="reloadCache()"
          />
        </view>
        <view class="button-row">
          <ActionButton
            testID="image-cache-clear-memory"
            title="Clear memory"
            [color]="color"
            (press)="clearMemory()"
          />
          <ActionButton
            testID="image-cache-clear-all"
            title="Clear memory and disk"
            [color]="color"
            (press)="clearAll()"
          />
        </view>
        <ActionButton
          testID="image-cache-path"
          title="getCachePathAsync(key)"
          [color]="color"
          (press)="showPath()"
        />
        <ResultRow
          testID="image-cache-path-result"
          label="Disk path"
          [value]="pathLine()"
        />
        <ActionButton
          testID="image-prefetch"
          title="Prefetch 4 gallery photos"
          [color]="color"
          (press)="prefetch()"
        />
        <ResultRow
          testID="image-prefetch-result"
          label="prefetchImages()"
          [value]="prefetchLine()"
        />
        <view class="img-grid">
          @for (uri of galleryUrls; track uri) {
            <ExpoImage
              [source]="uri"
              class="img-thumb"
              contentFit="cover"
              [transition]="150"
            />
          }
        </view>
      </Scenario>

      <Scenario
        testID="image-fit-scenario"
        title="Fit one photo into different boxes"
        why="Avatars crop, product photos must show everything, banners stretch. contentFit says how, like CSS object-fit, without extra wrapper views."
        [steps]="fitSteps"
        expect="cover fills the box and crops, contain shows the whole photo with bars, fill stretches it, none keeps the pixel size, scale-down is the smaller of none and contain."
      >
        <view class="img-grid">
          @for (fit of fits; track fit) {
            <view class="img-fit-cell">
              <view class="img-fit-frame">
                <ExpoImage
                  [testID]="'image-fit-' + fit"
                  [source]="fitSource"
                  [contentFit]="fit"
                  class="img-fit-image"
                />
              </view>
              <text class="img-fit-label">{{ fit }}</text>
            </view>
          }
        </view>
      </Scenario>

      <Scenario
        testID="image-error-scenario"
        title="Recover from a broken image"
        why="Links die. onError tells the app, a placeholder keeps the layout, and a retry button fixes it once the link works again."
        [steps]="errorSteps"
        expect="The first load shows an error line and the grey placeholder stays. After Fix the link the real photo loads and the line reports its size."
      >
        @for (round of errorRounds(); track round) {
          <ExpoImage
            testID="image-error-view"
            [source]="errorSource()"
            [placeholder]="greyPlaceholder"
            class="img-avatar"
            [onLoad]="onErrorLoad"
            [onError]="onErrorEvent"
          />
        }
        <ResultRow
          testID="image-error-result"
          label="Event"
          [value]="errorLine()"
        />
        <ActionButton
          testID="image-error-fix"
          [title]="errorTitle()"
          [color]="color"
          (press)="fixLink()"
        />
      </Scenario>

      <ImageExtras [color]="color" />
    </ScreenShell>
  `,
})
export class ImageScreen {
  readonly route = ROUTE;
  readonly color = lineColorOf(ROUTE);
  readonly galleryUrls = GALLERY_URLS;
  readonly fits = FITS;
  readonly blurhashPlaceholder = { blurhash: BLURHASH };
  readonly greyPlaceholder = { blurhash: GREY_BLURHASH };
  readonly cacheSource = { uri: photoUrl('1011', 500), cacheKey: CACHE_KEY };
  readonly fitSource = photoUrl('1025', 200);
  readonly smoothSteps = [
    'Press Load again, with the network on',
    'Watch the area while the photo downloads',
  ];
  readonly cacheSteps = [
    'Press Remount: the first load reports cache none',
    'Press Remount again: it reports memory',
    'Press Clear memory, then Remount: it reports disk',
    'Press Clear memory and disk, then Remount: it reports none again',
  ];
  readonly fitSteps = [
    'Compare the five boxes, each holds the same square photo',
  ];
  readonly errorSteps = ['Look at the broken image', 'Press Fix the link'];

  readonly heroLine = signal('loading…');
  readonly heroRound = signal(0);
  // A new key per round re-creates the image, so it loads again
  readonly heroRounds = computed(() => [this.heroRound()]);
  readonly heroSource = computed(() => ({
    uri: `${photoUrl('1018', 800)}?round=${this.heroRound()}`,
  }));

  readonly cacheRound = signal(0);
  readonly cacheRounds = computed(() => [this.cacheRound()]);
  readonly cacheLine = signal('not loaded yet');
  readonly pathLine = signal('unknown');
  readonly prefetchLine = signal('not prefetched');
  private readonly cacheHandle = viewChild<ExpoImage>('cacheHandle');

  readonly errorRound = signal(0);
  readonly errorRounds = computed(() => [this.errorRound()]);
  readonly isBroken = signal(true);
  readonly errorLine = signal('loading…');
  readonly errorSource = computed(() =>
    this.isBroken() ? BROKEN_URI : photoUrl('1035', 400),
  );
  readonly errorTitle = computed(() =>
    this.isBroken() ? 'Fix the link' : 'Break it again',
  );

  readonly onHeroLoad = (event: IImageLoadEventData): void =>
    this.heroLine.set(describeLoad(event));
  readonly onHeroError = (event: { error: string }): void =>
    this.heroLine.set(`error: ${event.error}`);
  readonly onCacheLoad = (event: IImageLoadEventData): void =>
    this.cacheLine.set(describeLoad(event));
  readonly onErrorLoad = (event: IImageLoadEventData): void =>
    this.errorLine.set(`loaded: ${describeLoad(event)}`);
  readonly onErrorEvent = (event: { error: string }): void =>
    this.errorLine.set(`error: ${event.error}`);

  reloadHero(): void {
    this.heroLine.set('loading…');
    this.heroRound.update(value => value + 1);
  }

  remount(): void {
    this.cacheLine.set('loading…');
    this.cacheRound.update(value => value + 1);
  }

  reloadCache(): void {
    void this.cacheHandle()?.reloadAsync();
  }

  clearMemory(): void {
    void clearMemoryCache();
  }

  clearAll(): void {
    void Promise.all([clearMemoryCache(), clearDiskCache()]);
  }

  showPath(): Promise<void> {
    return showResult(
      () => getCachePathAsync(CACHE_KEY),
      text => this.pathLine.set(text),
      path => path ?? 'null: not on disk',
    );
  }

  prefetch(): Promise<void> {
    this.prefetchLine.set('prefetching…');
    return showResult(
      () => prefetchImages(GALLERY_URLS),
      text => this.prefetchLine.set(text),
      String,
    );
  }

  fixLink(): void {
    this.errorLine.set('loading…');
    this.isBroken.update(value => !value);
    this.errorRound.update(value => value + 1);
  }
}
