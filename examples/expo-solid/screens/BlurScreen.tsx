import { For, Show, createSignal } from 'solid-js';
import type { IHostInstance } from '@symbiote-native/solid';
import { BlurTargetView, BlurView } from '@symbiote-native/blur/solid';
import type { IBlurMethod, IBlurTint } from '@symbiote-native/blur/solid';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { photoUrl } from './image-assets';

const ROUTE = ROUTE_NAME.Blur;
const PHOTO_URI = photoUrl('1039', 640);
const INTENSITY_STEP = 25;
const MAX_INTENSITY = 100;
const FEED_ROWS = ['Morning run', 'Coffee with Anna', 'Design review', 'Groceries', 'Call the bank', 'Gym', 'Dinner at 8'];

const TINTS: readonly IBlurTint[] = [
  'default', 'light', 'dark', 'extraLight', 'regular', 'prominent',
  'systemUltraThinMaterial', 'systemThinMaterial', 'systemMaterial', 'systemThickMaterial', 'systemChromeMaterial',
];
const METHODS: readonly IBlurMethod[] = ['none', 'dimezisBlurView', 'dimezisBlurViewSdk31Plus'];

function FrostedCardScenario(props: { color: string }) {
  const [target, setTarget] = createSignal<IHostInstance>();
  const [intensity, setIntensity] = createSignal(60);
  return (
    <Scenario
      testID="blur-card-scenario"
      title="Put readable text on a frosted glass card over a photo"
      why="Music players, weather and booking apps place a translucent card over a hero photo so the text stays readable while the picture still shows through."
      steps={['Wait for the photo to load', 'Press More blur and Less blur', 'Compare how sharp the photo is behind the card and outside it']}
      expect="The photo is sharp everywhere except behind the card, where it is blurred. The blur gets stronger with each More blur press up to 100."
    >
      <view class="blur-frame">
        <BlurTargetView ref={setTarget} class="blur-fill">
          <image testID="blur-photo" source={{ uri: PHOTO_URI }} class="blur-fill" />
        </BlurTargetView>
        <BlurView testID="blur-card" blurTarget={target()} blurMethod="dimezisBlurView" tint="dark" intensity={intensity()} class="blur-card">
          <text class="blur-card-title">Now playing</text>
          <text class="blur-card-body">The background behind this card is blurred</text>
        </BlurView>
      </view>
      <ResultRow testID="blur-card-intensity" label="intensity" value={String(intensity())} />
      <view class="button-row">
        <ActionButton testID="blur-less" title="Less blur" color={props.color} onPress={() => setIntensity(value => Math.max(1, value - INTENSITY_STEP))} />
        <ActionButton testID="blur-more" title="More blur" color={props.color} onPress={() => setIntensity(value => Math.min(MAX_INTENSITY, value + INTENSITY_STEP))} />
      </view>
    </Scenario>
  );
}

function TranslucentBarScenario() {
  const [target, setTarget] = createSignal<IHostInstance>();
  return (
    <Scenario
      testID="blur-bar-scenario"
      title="Show a translucent bottom bar over a scrolling list"
      why="Tab bars and sticky headers in system apps blur the content that scrolls under them. This keeps the bar visible without a solid block hiding the list."
      steps={['Scroll the list inside the frame up and down', 'Watch the rows pass under the bottom bar']}
      expect="Rows are sharp above the bar and blurred while they are under it. The bar text stays readable the whole time."
    >
      <view class="blur-feed-frame">
        <BlurTargetView ref={setTarget} class="blur-fill">
          <scroll-view testID="blur-feed" nestedScrollEnabled class="blur-fill" contentContainerStyle="blur-feed-content">
            <For each={FEED_ROWS}>
              {row => (
                <view class="blur-feed-row">
                  <text class="blur-feed-text">{row}</text>
                </view>
              )}
            </For>
          </scroll-view>
        </BlurTargetView>
        <BlurView testID="blur-bar" blurTarget={target()} blurMethod="dimezisBlurView" tint="systemChromeMaterialDark" intensity={80} class="blur-bar">
          <text class="blur-bar-text">Home · Search · Profile</text>
        </BlurView>
      </view>
    </Scenario>
  );
}

function SpoilerScenario(props: { color: string }) {
  const [target, setTarget] = createSignal<IHostInstance>();
  const [isRevealed, setIsRevealed] = createSignal(false);
  return (
    <Scenario
      testID="blur-spoiler-scenario"
      title="Hide a balance or a spoiler until the user taps"
      why="Banking and messaging apps blur sensitive values by default so nobody reads them over a shoulder. A tap reveals them."
      steps={['Look at the balance, it is unreadable', 'Press Reveal', 'Press Hide']}
      expect="The amount is blurred into color noise at first, fully readable after Reveal, and blurred again after Hide."
    >
      <view class="blur-secret">
        <BlurTargetView ref={setTarget} class="blur-fill">
          <view class="blur-secret">
            <text class="blur-secret-text">Balance: $12,480.00</text>
          </view>
        </BlurTargetView>
        <Show when={!isRevealed()}>
          <BlurView testID="blur-secret-cover" blurTarget={target()} blurMethod="dimezisBlurView" tint="light" intensity={100} class="blur-secret-cover" />
        </Show>
      </view>
      <ActionButton testID="blur-secret-toggle" title={isRevealed() ? 'Hide' : 'Reveal'} color={props.color} onPress={() => setIsRevealed(value => !value)} />
    </Scenario>
  );
}

function ExplorerCard(props: { color: string }) {
  const [target, setTarget] = createSignal<IHostInstance>();
  const [tint, setTint] = createSignal<IBlurTint>('default');
  const [method, setMethod] = createSignal<IBlurMethod>('dimezisBlurView');
  const [reduction, setReduction] = createSignal(4);
  return (
    <Explorer testID="blur-explorer" color={props.color}>
      <Card testID="blur-playground" title="Every prop">
        <view class="blur-frame">
          <BlurTargetView ref={setTarget} class="blur-fill">
            <image source={{ uri: PHOTO_URI }} class="blur-fill" />
          </BlurTargetView>
          <BlurView testID="blur-playground-view" blurTarget={target()} tint={tint()} blurMethod={method()} blurReductionFactor={reduction()} intensity={70} class="blur-fill" />
        </view>
        <ChoiceRow testID="blur-tint" label="tint (iOS: all, Android: light, dark, default)" color={props.color} value={tint()} options={TINTS.map(item => ({ label: item, value: item }))} onChange={setTint} />
        <ChoiceRow testID="blur-method" label="blurMethod (Android only, none = translucent view)" color={props.color} value={method()} options={METHODS.map(item => ({ label: item, value: item }))} onChange={setMethod} />
        <ChoiceRow testID="blur-reduction" label="blurReductionFactor (Android only)" color={props.color} value={reduction()} options={[2, 4, 8].map(item => ({ label: String(item), value: item }))} onChange={setReduction} />
      </Card>
    </Explorer>
  );
}

export function BlurScreen() {
  const color = lineColorOf(ROUTE);
  return (
    <ScreenShell
      route={ROUTE}
      testID="blur-scroll"
      title="Blur"
      body="A native view that blurs whatever is behind it. On Android the blurred content has to sit inside a BlurTargetView, on iOS the target is a plain view and blur just works."
    >
      <FrostedCardScenario color={color} />
      <TranslucentBarScenario />
      <SpoilerScenario color={color} />
      <ExplorerCard color={color} />
    </ScreenShell>
  );
}
