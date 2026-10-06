import { useRef, useState } from 'react';
import { Platform } from '@symbiote-native/react';
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
} from '@symbiote-native/image/react';
import type { IImageContentFit, IImageViewHandle, ImageRef } from '@symbiote-native/image/react';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ToggleRow } from '../components/ScreenShell';
import { ANIMATED_URI, BLURHASH, GALLERY_URLS, photoUrl } from './image-assets';

const IS_IOS = Platform.select({ ios: true, default: false });
const BLURHASH_COMPONENTS: [number, number] = [4, 3];
const HASH_PREVIEW_SIZE = 96;
const CACHE_DISK_BYTES = 100_000_000;
const LOAD_MAX_WIDTH = 64;
const WRITTEN_KEY = 'canary-written-key';

// The reference is native memory, so it is described and released at once
function describeRef(ref: ImageRef | null): string {
  if (ref === null) return 'null: nothing under that key';
  const text = `${ref.width}x${ref.height}, scale ${ref.scale}, ${ref.mediaType ?? 'unknown type'}`;
  ref.release();
  return text;
}

const POSITIONS = ['center', 'top', 'bottom', 'left', 'right'] as const;
type IPosition = (typeof POSITIONS)[number];
const PLAYGROUND_FITS: readonly IImageContentFit[] = ['cover', 'contain'];

function AnimatedScenario({ color }: { color: string }) {
  const handle = useRef<IImageViewHandle>(null);
  const [isAutoplay, setIsAutoplay] = useState(true);
  const [line, setLine] = useState('loading…');
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
        ref={handle}
        source={{ uri: ANIMATED_URI, isAnimated: true }}
        autoplay={isAutoplay}
        contentFit="cover"
        className="img-animated"
        onLoad={event => setLine(`animated: ${String(event.source.isAnimated)}, ${event.source.mediaType ?? 'unknown'}`)}
      />
      <ResultRow testID="image-animated-result" label="onLoad" value={line} />
      <view className="button-row">
        <ActionButton testID="image-animated-stop" title="stopAnimating" color={color} onPress={() => void handle.current?.stopAnimating()} />
        <ActionButton testID="image-animated-start" title="startAnimating" color={color} onPress={() => void handle.current?.startAnimating()} />
        <ActionButton testID="image-animated-reload" title="Reload" color={color} onPress={() => void handle.current?.reloadAsync()} />
      </view>
      <ToggleRow testID="image-animated-autoplay" label="autoplay" value={isAutoplay} onChange={setIsAutoplay} color={color} />
    </Scenario>
  );
}

function SymbolScenario({ color }: { color: string }) {
  const [isLiked, setIsLiked] = useState(false);
  return (
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
          source={isLiked ? 'sf:heart.fill' : 'sf:heart'}
          tintColor="#ec4899"
          transition={{ effect: 'sf:replace', duration: 300 }}
          sfEffect={isLiked ? 'bounce' : null}
          className="img-symbol"
        />
      ) : (
        <text className="hero-body">SF Symbol sources are iOS only.</text>
      )}
      <ActionButton testID="image-sf-toggle" title="Toggle" color={color} onPress={() => setIsLiked(value => !value)} />
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
      <scroll-view testID="image-list" nestedScrollEnabled className="img-list">
        {GALLERY_URLS.concat(GALLERY_URLS).map((uri, index) => (
          <view key={`${uri}-${String(index)}`} className="img-row">
            <Image
              testID={`image-list-row-${String(index)}`}
              source={uri}
              recyclingKey={`row-${String(index)}`}
              placeholder={{ blurhash: BLURHASH }}
              loading="lazy"
              contentFit="cover"
              transition={200}
              className="img-row-photo"
            />
            <text className="capability-label">{`Photo ${String(index + 1)}`}</text>
          </view>
        ))}
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
        className="img-banner"
      >
        <text className="img-banner-text">Weekend in the mountains</text>
      </ImageBackground>
    </Scenario>
  );
}

function HashScenario({ color }: { color: string }) {
  const image = useImage(photoUrl('1044', 400));
  const [blurhash, setBlurhash] = useState<string | null>(null);
  const [thumbhash, setThumbhash] = useState('not generated');
  const generate = () => {
    if (image === null) {
      setThumbhash('the photo is still loading');
      return;
    }
    generateBlurhashAsync(image, BLURHASH_COMPONENTS)
      .then(setBlurhash)
      .catch((error: Error) => setBlurhash(`failed: ${error.message}`));
    generateThumbhashAsync(image)
      .then(hash => setThumbhash(`${hash.length} chars`))
      .catch((error: Error) => setThumbhash(`failed: ${error.message}`));
  };
  return (
    <Scenario
      testID="image-hash-scenario"
      title="Make a blur preview from a photo the user picked"
      why="Feeds show blur previews from a short hash. When a user uploads a photo the app computes the hash once and sends it with the file, so every viewer gets an instant preview."
      steps={['Wait until the photo is loaded into a native reference', 'Press Generate hashes', 'Compare the small preview with the photo']}
      expect="A blurhash string appears, a thumbhash length is reported, and the small preview below is drawn from the hash alone, with no download."
    >
      <ResultRow testID="image-hash-ready" label="useImage()" value={image === null ? 'loading…' : `${image.width}x${image.height} ref ready`} />
      <ActionButton testID="image-hash-generate" title="Generate hashes" color={color} onPress={generate} />
      <ResultRow testID="image-blurhash" label="generateBlurhashAsync(4x3)" value={blurhash ?? 'not generated'} />
      <ResultRow testID="image-thumbhash" label="generateThumbhashAsync" value={thumbhash} />
      {blurhash !== null && !blurhash.startsWith('failed') && (
        <Image testID="image-hash-preview" source={{ blurhash, width: HASH_PREVIEW_SIZE, height: HASH_PREVIEW_SIZE }} className="img-hash" />
      )}
    </Scenario>
  );
}

export function ImageExtras({ color }: { color: string }) {
  const playground = useRef<IImageViewHandle>(null);
  const [position, setPosition] = useState<IPosition>('center');
  const [fit, setFit] = useState<IImageContentFit>('cover');
  const [blurRadius, setBlurRadius] = useState(0);
  const [isTinted, setIsTinted] = useState(false);
  return (
    <>
      <AnimatedScenario color={color} />
      <SymbolScenario color={color} />
      <FeedListScenario />
      <BackgroundScenario />
      <HashScenario color={color} />
      <Explorer testID="image-explorer" color={color}>
        <Card testID="image-playground" title="Every prop">
          <Image
            testID="image-playground-view"
            ref={playground}
            source={photoUrl('1050', 900)}
            contentFit={fit}
            contentPosition={position}
            blurRadius={blurRadius}
            tintColor={isTinted ? '#f97316' : null}
            priority="high"
            className="img-playground"
          />
          <ChoiceRow testID="image-playground-fit" label="contentFit" color={color} value={fit} options={PLAYGROUND_FITS.map(item => ({ label: item, value: item }))} onChange={setFit} />
          <ChoiceRow testID="image-playground-position" label="contentPosition" color={color} value={position} options={POSITIONS.map(item => ({ label: item, value: item }))} onChange={setPosition} />
          <ChoiceRow testID="image-playground-blur" label="blurRadius" color={color} value={blurRadius} options={[0, 8, 24].map(item => ({ label: String(item), value: item }))} onChange={setBlurRadius} />
          <ToggleRow testID="image-playground-tint" label="tintColor (orange)" value={isTinted} onChange={setIsTinted} color={color} />
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
            { label: 'lockResourceAsync', run: async () => playground.current?.lockResourceAsync() },
            { label: 'unlockResourceAsync', run: async () => playground.current?.unlockResourceAsync() },
            { label: 'reloadAsync', run: async () => playground.current?.reloadAsync() },
          ]}
        />
      </Explorer>
    </>
  );
}
