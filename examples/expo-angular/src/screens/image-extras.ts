import { Component, computed, input, signal, viewChild } from '@angular/core';
import { Platform, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  ExpoImage,
  ExpoImageBackground,
  configureCache,
  generateBlurhashAsync,
  generateThumbhashAsync,
  injectImage,
  loadImageAsync,
  readFromCacheAsync,
  writeToCacheAsync,
} from '@symbiote-native/image/angular';
import type {
  IImageContentFit,
  IImageLoadEventData,
} from '@symbiote-native/image/angular';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Explorer } from '../components/Explorer';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ToggleRow } from '../components/ToggleRow';
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

const IOS_OS = 'ios';
const FAILED_PREFIX = 'failed';

@Component({
  selector: 'ImageExtras',
  standalone: true,
  imports: [
    ActionButton,
    CallConsole,
    Card,
    ChoiceRow,
    Explorer,
    ExpoImage,
    ExpoImageBackground,
    ResultRow,
    Scenario,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <Scenario
      testID="image-animated-scenario"
      title="Play a GIF or an animated WebP, and pause it"
      why="Stickers, loaders and reactions are animated images. They play on their own, and a screen can pause them to save battery or let the user tap to play."
      [steps]="animatedSteps"
      expect="The globe spins, freezes after stopAnimating and spins again after startAnimating. With autoplay off it loads frozen until you start it."
    >
      <ExpoImage
        #animatedHandle
        testID="image-animated"
        [source]="animatedSource"
        [autoplay]="isAutoplay()"
        contentFit="cover"
        class="img-animated"
        [onLoad]="onAnimatedLoad"
      />
      <ResultRow
        testID="image-animated-result"
        label="onLoad"
        [value]="animatedLine()"
      />
      <view class="button-row">
        <ActionButton
          testID="image-animated-stop"
          title="stopAnimating"
          [color]="color()"
          (press)="stopAnimating()"
        />
        <ActionButton
          testID="image-animated-start"
          title="startAnimating"
          [color]="color()"
          (press)="startAnimating()"
        />
        <ActionButton
          testID="image-animated-reload"
          title="Reload"
          [color]="color()"
          (press)="reloadAnimated()"
        />
      </view>
      <ToggleRow
        testID="image-animated-autoplay"
        label="autoplay"
        [color]="color()"
        [(value)]="isAutoplay"
      />
    </Scenario>

    <Scenario
      testID="image-sf-scenario"
      title="Use an SF Symbol as an image source (iOS)"
      why="A source like sf:heart.fill draws a system icon with the image pipeline, so it can be tinted, transitioned and animated like any image."
      [steps]="symbolSteps"
      expect="On iOS the icon swaps between an outline and a filled heart with a replace effect, tinted pink. On Android nothing is drawn: SF Symbols do not exist there."
    >
      @if (isIos) {
        <ExpoImage
          testID="image-sf-symbol"
          [source]="heartSource()"
          tintColor="#ec4899"
          [transition]="sfTransition"
          [sfEffect]="heartEffect()"
          class="img-symbol"
        />
      } @else {
        <text class="hero-body">SF Symbol sources are iOS only.</text>
      }
      <ActionButton
        testID="image-sf-toggle"
        title="Toggle"
        [color]="color()"
        (press)="isLiked.set(!isLiked())"
      />
    </Scenario>

    <Scenario
      testID="image-list-scenario"
      title="Scroll a long photo list without flicker"
      why="Feeds and galleries reuse rows while scrolling. recyclingKey tells the image view which photo belongs to the row, so a reused row never shows the previous photo, and lazy loading skips rows far off screen."
      [steps]="listSteps"
      expect="Every row shows a colored blur first and its own photo after, never the photo of another row. Rows far from the screen load only when they come near."
    >
      <scroll-view
        testID="image-list"
        [nestedScrollEnabled]="true"
        class="img-list"
      >
        @for (uri of listUrls; track $index; let index = $index) {
          <view class="img-row">
            <ExpoImage
              [testID]="'image-list-row-' + index"
              [source]="uri"
              [recyclingKey]="'row-' + index"
              [placeholder]="blurhashPlaceholder"
              loading="lazy"
              contentFit="cover"
              [transition]="200"
              class="img-row-photo"
            />
            <text class="capability-label">{{ 'Photo ' + (index + 1) }}</text>
          </view>
        }
      </scroll-view>
    </Scenario>

    <Scenario
      testID="image-background-scenario"
      title="Put text on top of a cached photo"
      why="Cards, hero sections and onboarding pages need a picture behind their content. ImageBackground gives the picture the caching and placeholder of the image view."
      [steps]="backgroundSteps"
      expect="The photo fills the card, the white title sits on top of it at the bottom, and the card keeps its rounded corners."
    >
      <ExpoImageBackground
        testID="image-background"
        [source]="bannerSource"
        contentFit="cover"
        [transition]="300"
        class="img-banner"
      >
        <text class="img-banner-text">Weekend in the mountains</text>
      </ExpoImageBackground>
    </Scenario>

    <Scenario
      testID="image-hash-scenario"
      title="Make a blur preview from a photo the user picked"
      why="Feeds show blur previews from a short hash. When a user uploads a photo the app computes the hash once and sends it with the file, so every viewer gets an instant preview."
      [steps]="hashSteps"
      expect="A blurhash string appears, a thumbhash length is reported, and the small preview below is drawn from the hash alone, with no download."
    >
      <ResultRow
        testID="image-hash-ready"
        label="useImage()"
        [value]="hashReady()"
      />
      <ActionButton
        testID="image-hash-generate"
        title="Generate hashes"
        [color]="color()"
        (press)="generate()"
      />
      <ResultRow
        testID="image-blurhash"
        label="generateBlurhashAsync(4x3)"
        [value]="blurhashLabel()"
      />
      <ResultRow
        testID="image-thumbhash"
        label="generateThumbhashAsync"
        [value]="thumbhash()"
      />
      @if (hashPreview(); as preview) {
        <ExpoImage
          testID="image-hash-preview"
          [source]="preview"
          class="img-hash"
        />
      }
    </Scenario>

    <Explorer testID="image-explorer" [color]="color()">
      <ng-template>
        <Card testID="image-playground" title="Every prop">
          <ExpoImage
            #playgroundHandle
            testID="image-playground-view"
            [source]="playgroundSource"
            [contentFit]="fit()"
            [contentPosition]="position()"
            [blurRadius]="blurRadius()"
            [tintColor]="playgroundTint()"
            priority="high"
            class="img-playground"
          />
          <ChoiceRow
            testID="image-playground-fit"
            label="contentFit"
            [color]="color()"
            [options]="fitOptions"
            [(value)]="fit"
          />
          <ChoiceRow
            testID="image-playground-position"
            label="contentPosition"
            [color]="color()"
            [options]="positionOptions"
            [(value)]="position"
          />
          <ChoiceRow
            testID="image-playground-blur"
            label="blurRadius"
            [color]="color()"
            [options]="blurOptions"
            [(value)]="blurRadius"
          />
          <ToggleRow
            testID="image-playground-tint"
            label="tintColor (orange)"
            [color]="color()"
            [(value)]="isTinted"
          />
        </Card>
        <CallConsole
          prefix="image-calls"
          title="Cache and loading API"
          [color]="color()"
          hint="Write the photo into the cache under a key, read it back, load it into a native reference, lock or reload the playground view."
          [calls]="calls"
        />
      </ng-template>
    </Explorer>
  `,
})
export class ImageExtras {
  readonly color = input.required<string>();

  readonly isIos = Platform.OS === IOS_OS;
  readonly listUrls = GALLERY_URLS.concat(GALLERY_URLS);
  readonly animatedSource = { uri: ANIMATED_URI, isAnimated: true };
  readonly blurhashPlaceholder = { blurhash: BLURHASH };
  readonly sfTransition = { effect: 'sf:replace', duration: 300 } as const;
  readonly bannerSource = photoUrl('1043', 700);
  readonly playgroundSource = photoUrl('1050', 900);
  readonly fitOptions = FIT_OPTIONS;
  readonly positionOptions = POSITION_OPTIONS;
  readonly blurOptions = BLUR_OPTIONS;
  readonly animatedSteps = [
    'Wait for the globe to spin',
    'Press stopAnimating, then startAnimating',
    'Turn autoplay off and press Reload',
  ];
  readonly symbolSteps = [
    'Press Toggle and watch the icon swap',
    'Look at the tint color',
  ];
  readonly listSteps = [
    'Scroll the list fast up and down',
    'Watch the rows as they come into view',
  ];
  readonly backgroundSteps = ['Look at the card'];
  readonly hashSteps = [
    'Wait until the photo is loaded into a native reference',
    'Press Generate hashes',
    'Compare the small preview with the photo',
  ];

  private readonly animatedHandle = viewChild<ExpoImage>('animatedHandle');
  private readonly playgroundHandle = viewChild<ExpoImage>('playgroundHandle');

  readonly isAutoplay = signal(true);
  readonly animatedLine = signal('loading…');
  readonly onAnimatedLoad = (event: IImageLoadEventData): void =>
    this.animatedLine.set(
      `animated: ${String(event.source.isAnimated)}, ${event.source.mediaType ?? 'unknown'}`,
    );

  readonly isLiked = signal(false);
  readonly heartSource = computed(() =>
    this.isLiked() ? 'sf:heart.fill' : 'sf:heart',
  );
  readonly heartEffect = computed(() => (this.isLiked() ? 'bounce' : null));

  private readonly image = injectImage(() => photoUrl('1044', 400));
  readonly blurhash = signal<string | null>(null);
  readonly thumbhash = signal('not generated');
  readonly blurhashLabel = computed(() => this.blurhash() ?? 'not generated');
  readonly hashReady = computed(() => {
    const current = this.image();
    return current === null
      ? 'loading…'
      : `${current.width}x${current.height} ref ready`;
  });
  readonly hashPreview = computed(() => {
    const hash = this.blurhash();
    return hash !== null && !hash.startsWith(FAILED_PREFIX)
      ? { blurhash: hash, width: HASH_PREVIEW_SIZE, height: HASH_PREVIEW_SIZE }
      : null;
  });

  readonly position = signal<IPosition>(POSITIONS[0]);
  readonly fit = signal<IImageContentFit>('cover');
  readonly blurRadius = signal(0);
  readonly isTinted = signal(false);
  readonly playgroundTint = computed(() =>
    this.isTinted() ? '#f97316' : null,
  );

  readonly calls = [
    {
      label: 'configureCache (100 MB disk)',
      run: async () => configureCache({ maxDiskSize: CACHE_DISK_BYTES }),
    },
    {
      label: 'writeToCacheAsync',
      run: () => writeToCacheAsync(photoUrl('1050', 300), WRITTEN_KEY),
    },
    {
      label: 'readFromCacheAsync',
      run: async () => describeRef(await readFromCacheAsync(WRITTEN_KEY)),
    },
    {
      label: 'loadImageAsync (maxWidth 64)',
      run: async () =>
        describeRef(
          await loadImageAsync(photoUrl('1050', 300), {
            maxWidth: LOAD_MAX_WIDTH,
          }),
        ),
    },
    {
      label: 'lockResourceAsync',
      run: async () => this.playgroundHandle()?.lockResourceAsync(),
    },
    {
      label: 'unlockResourceAsync',
      run: async () => this.playgroundHandle()?.unlockResourceAsync(),
    },
    {
      label: 'reloadAsync',
      run: async () => this.playgroundHandle()?.reloadAsync(),
    },
  ];

  stopAnimating(): void {
    void this.animatedHandle()?.stopAnimating();
  }

  startAnimating(): void {
    void this.animatedHandle()?.startAnimating();
  }

  reloadAnimated(): void {
    void this.animatedHandle()?.reloadAsync();
  }

  generate(): void {
    const current = this.image();
    if (current === null) {
      this.thumbhash.set('the photo is still loading');
      return;
    }
    void showResult(
      () => generateBlurhashAsync(current, BLURHASH_COMPONENTS),
      text => this.blurhash.set(text),
      String,
    );
    void showResult(
      () => generateThumbhashAsync(current),
      text => this.thumbhash.set(text),
      hash => `${hash.length} chars`,
    );
  }
}
