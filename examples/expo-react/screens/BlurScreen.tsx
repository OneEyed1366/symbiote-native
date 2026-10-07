import { useRef, useState } from 'react';
import type { IHostInstance } from '@symbiote-native/react';
import { BlurTargetView, BlurView } from '@symbiote-native/blur/react';
import type { IBlurMethod, IBlurTint } from '@symbiote-native/blur/react';
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

function FrostedCardScenario({ color }: { color: string }) {
  const target = useRef<IHostInstance>(null);
  const [intensity, setIntensity] = useState(60);
  return (
    <Scenario
      testID="blur-card-scenario"
      title="Put readable text on a frosted glass card over a photo"
      why="Music players, weather and booking apps place a translucent card over a hero photo so the text stays readable while the picture still shows through."
      steps={['Wait for the photo to load', 'Press More blur and Less blur', 'Compare how sharp the photo is behind the card and outside it']}
      expect="The photo is sharp everywhere except behind the card, where it is blurred. The blur gets stronger with each More blur press up to 100."
    >
      <view className="blur-frame">
        <BlurTargetView ref={target} className="blur-fill">
          <image testID="blur-photo" source={{ uri: PHOTO_URI }} className="blur-fill" />
        </BlurTargetView>
        <BlurView testID="blur-card" blurTarget={target} blurMethod="dimezisBlurView" tint="dark" intensity={intensity} className="blur-card">
          <text className="blur-card-title">Now playing</text>
          <text className="blur-card-body">The background behind this card is blurred</text>
        </BlurView>
      </view>
      <ResultRow testID="blur-card-intensity" label="intensity" value={String(intensity)} />
      <view className="button-row">
        <ActionButton testID="blur-less" title="Less blur" color={color} onPress={() => setIntensity(value => Math.max(1, value - INTENSITY_STEP))} />
        <ActionButton testID="blur-more" title="More blur" color={color} onPress={() => setIntensity(value => Math.min(MAX_INTENSITY, value + INTENSITY_STEP))} />
      </view>
    </Scenario>
  );
}

function TranslucentBarScenario() {
  const target = useRef<IHostInstance>(null);
  return (
    <Scenario
      testID="blur-bar-scenario"
      title="Show a translucent bottom bar over a scrolling list"
      why="Tab bars and sticky headers in system apps blur the content that scrolls under them. This keeps the bar visible without a solid block hiding the list."
      steps={['Scroll the list inside the frame up and down', 'Watch the rows pass under the bottom bar']}
      expect="Rows are sharp above the bar and blurred while they are under it. The bar text stays readable the whole time."
    >
      <view className="blur-feed-frame">
        <BlurTargetView ref={target} className="blur-fill">
          <scroll-view testID="blur-feed" nestedScrollEnabled className="blur-fill" contentContainerStyle="blur-feed-content">
            {FEED_ROWS.map(row => (
              <view key={row} className="blur-feed-row">
                <text className="blur-feed-text">{row}</text>
              </view>
            ))}
          </scroll-view>
        </BlurTargetView>
        <BlurView testID="blur-bar" blurTarget={target} blurMethod="dimezisBlurView" tint="systemChromeMaterialDark" intensity={80} className="blur-bar">
          <text className="blur-bar-text">Home · Search · Profile</text>
        </BlurView>
      </view>
    </Scenario>
  );
}

function SpoilerScenario({ color }: { color: string }) {
  const target = useRef<IHostInstance>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  return (
    <Scenario
      testID="blur-spoiler-scenario"
      title="Hide a balance or a spoiler until the user taps"
      why="Banking and messaging apps blur sensitive values by default so nobody reads them over a shoulder. A tap reveals them."
      steps={['Look at the balance, it is unreadable', 'Press Reveal', 'Press Hide']}
      expect="The amount is blurred into color noise at first, fully readable after Reveal, and blurred again after Hide."
    >
      <view className="blur-secret">
        <BlurTargetView ref={target} className="blur-fill">
          <view className="blur-secret">
            <text className="blur-secret-text">Balance: $12,480.00</text>
          </view>
        </BlurTargetView>
        {!isRevealed && <BlurView testID="blur-secret-cover" blurTarget={target} blurMethod="dimezisBlurView" tint="light" intensity={100} className="blur-secret-cover" />}
      </view>
      <ActionButton testID="blur-secret-toggle" title={isRevealed ? 'Hide' : 'Reveal'} color={color} onPress={() => setIsRevealed(value => !value)} />
    </Scenario>
  );
}

function ExplorerCard({ color }: { color: string }) {
  const target = useRef<IHostInstance>(null);
  const [tint, setTint] = useState<IBlurTint>('default');
  const [method, setMethod] = useState<IBlurMethod>('dimezisBlurView');
  const [reduction, setReduction] = useState(4);
  return (
    <Explorer testID="blur-explorer" color={color}>
      <Card testID="blur-playground" title="Every prop">
        <view className="blur-frame">
          <BlurTargetView ref={target} className="blur-fill">
            <image source={{ uri: PHOTO_URI }} className="blur-fill" />
          </BlurTargetView>
          <BlurView testID="blur-playground-view" blurTarget={target} tint={tint} blurMethod={method} blurReductionFactor={reduction} intensity={70} className="blur-fill" />
        </view>
        <ChoiceRow testID="blur-tint" label="tint (iOS: all, Android: light, dark, default)" color={color} value={tint} options={TINTS.map(item => ({ label: item, value: item }))} onChange={setTint} />
        <ChoiceRow testID="blur-method" label="blurMethod (Android only, none = translucent view)" color={color} value={method} options={METHODS.map(item => ({ label: item, value: item }))} onChange={setMethod} />
        <ChoiceRow testID="blur-reduction" label="blurReductionFactor (Android only)" color={color} value={reduction} options={[2, 4, 8].map(item => ({ label: String(item), value: item }))} onChange={setReduction} />
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
