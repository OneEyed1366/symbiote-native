import { For, Show, createMemo, createResource, createSignal } from 'solid-js';
import { SymbolView, unstable_getMaterialSymbolSourceAsync } from '@symbiote-native/symbols/solid';
import type { IAnimationSpec, ISymbolType } from '@symbiote-native/symbols/solid';
import thin from '@symbiote-native/symbols/androidWeights/thin';
import light from '@symbiote-native/symbols/androidWeights/light';
import regular from '@symbiote-native/symbols/androidWeights/regular';
import medium from '@symbiote-native/symbols/androidWeights/medium';
import semiBold from '@symbiote-native/symbols/androidWeights/semiBold';
import bold from '@symbiote-native/symbols/androidWeights/bold';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ScreenShell, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.Symbols;
const TAB_ICON_SIZE = 26;
const NO_EFFECT = 'none';
const PALETTE_TYPE: ISymbolType = 'palette';

const TABS = [
  { label: 'Home', name: { ios: 'house.fill', android: 'home' } },
  { label: 'Search', name: { ios: 'magnifyingglass', android: 'search' } },
  { label: 'Alerts', name: { ios: 'bell.fill', android: 'notifications' } },
  { label: 'Profile', name: { ios: 'person.crop.circle.fill', android: 'person' } },
] as const;

const WEIGHTS = [
  { label: 'thin', ios: 'thin', android: thin },
  { label: 'light', ios: 'light', android: light },
  { label: 'regular', ios: 'regular', android: regular },
  { label: 'medium', ios: 'medium', android: medium },
  { label: 'semibold', ios: 'semibold', android: semiBold },
  { label: 'bold', ios: 'bold', android: bold },
] as const;

const TYPES: readonly ISymbolType[] = ['monochrome', 'hierarchical', PALETTE_TYPE, 'multicolor'];
const EFFECTS = [NO_EFFECT, 'bounce', 'pulse', 'scale'] as const;
type IEffectName = (typeof EFFECTS)[number];

function TabBarScenario(props: { activeColor: string }) {
  const [active, setActive] = createSignal<string>(TABS[0].label);
  return (
    <Scenario
      testID="symbols-tabs-scenario"
      title="Use system icons in a tab bar or a menu"
      why="One name pair gives the platform icon: an SF Symbol on iOS and a Material Symbol on Android. No icon files to export, and they scale and tint like text."
      steps={['Press each tab in turn', 'Compare the icon shapes with the system apps on this device']}
      expect="The pressed tab icon and label turn to the accent color, the others stay grey. The icons look native to the platform."
    >
      <view testID="symbols-tabs" class="sym-tab-bar">
        <For each={TABS}>
          {tab => {
            const tint = () => (tab.label === active() ? props.activeColor : '#64748b');
            return (
              <pressable testID={`symbols-tab-${tab.label}`} class="sym-tab" onPress={() => setActive(tab.label)}>
                <SymbolView name={tab.name} size={TAB_ICON_SIZE} tintColor={tint()} fallback={<text>?</text>} />
                <text class="sym-tab-label" style={{ color: tint() }}>{tab.label}</text>
              </pressable>
            );
          }}
        </For>
      </view>
      <ResultRow testID="symbols-active-tab" label="Selected tab" value={active()} />
    </Scenario>
  );
}

function WeightScenario(props: { color: string }) {
  return (
    <Scenario
      testID="symbols-weight-scenario"
      title="Match icon weight to the text next to it"
      why="A thin icon beside bold text looks broken. Weight lets a row of icons follow the text weight of the design."
      steps={['Look at the row from thin to bold', 'Compare the stroke thickness of the first and last icon']}
      expect="The strokes get visibly thicker from left to right, the sizes stay the same."
    >
      <view class="sym-weight-row">
        <For each={WEIGHTS}>
          {item => (
            <view class="sym-weight-cell">
              <SymbolView
                testID={`symbols-weight-${item.label}`}
                name={{ ios: 'star.fill', android: 'star' }}
                weight={{ ios: item.ios, android: item.android }}
                size={30}
                tintColor={props.color}
              />
              <text class="sym-weight-label">{item.label}</text>
            </view>
          )}
        </For>
      </view>
    </Scenario>
  );
}

function animationOf(effect: IEffectName, isRepeating: boolean): IAnimationSpec | undefined {
  return effect === NO_EFFECT ? undefined : { effect: { type: effect }, repeating: isRepeating };
}

function AnimationScenario(props: { color: string }) {
  const [liked, setLiked] = createSignal(false);
  const [plays, setPlays] = createSignal(0);
  return (
    <Scenario
      testID="symbols-animation-scenario"
      title="Make a like or a download button feel alive"
      why="A small bounce on press confirms the tap. SF Symbols animate natively, no animation code or Lottie file is needed (iOS 17 and later)."
      steps={['Press the heart a few times']}
      expect="On iOS 17+ the heart bounces on every press and turns red or grey. On Android it only changes color."
    >
      <pressable
        testID="symbols-like"
        onPress={() => {
          setLiked(value => !value);
          setPlays(value => value + 1);
        }}
      >
        <For each={[plays()]}>
          {() => (
            <SymbolView
              name={{ ios: liked() ? 'heart.fill' : 'heart', android: 'favorite' }}
              size={48}
              tintColor={liked() ? '#ef4444' : '#64748b'}
              animationSpec={{ effect: { type: 'bounce' } }}
              class="sym-big"
            />
          )}
        </For>
      </pressable>
      <ResultRow testID="symbols-like-state" label="Liked" value={String(liked())} />
      <ActionButton testID="symbols-like-reset" title="Reset" color={props.color} onPress={() => setLiked(false)} />
    </Scenario>
  );
}

function FallbackScenario() {
  return (
    <Scenario
      testID="symbols-fallback-scenario"
      title="Show something when a platform has no symbol"
      why="Some SF Symbols have no Material twin. With a name for one platform only, the fallback renders on the other instead of an empty gap."
      steps={['Look at both rows on iOS, then on Android']}
      expect="The iOS-only symbol shows the gear on iOS and the text fallback on Android. The Android-only symbol shows its glyph on Android and the fallback on iOS."
    >
      <view class="capability-row">
        <text class="capability-label">name: only ios</text>
        <SymbolView testID="symbols-ios-only" name={{ ios: 'gearshape.fill' }} size={28} tintColor="#e2e8f0" fallback={<text class="value-text">no symbol here</text>} />
      </view>
      <view class="capability-row">
        <text class="capability-label">name: only android</text>
        <SymbolView testID="symbols-android-only" name={{ android: 'settings' }} size={28} tintColor="#e2e8f0" fallback={<text class="value-text">no symbol here</text>} />
      </view>
    </Scenario>
  );
}

function MaterialSourceCard() {
  const [source] = createResource(() => unstable_getMaterialSymbolSourceAsync('home', 40, '#ffffff'));
  const status = () => {
    if (source.error) return `failed: ${String(source.error.message)}`;
    if (source.loading) return 'rendering…';
    const result = source();
    return result === null || result === undefined ? 'null: iOS has no Material font path' : `${result.width}x${result.height}`;
  };
  return (
    <Card testID="symbols-source-card" title="Symbol as an image (Android)">
      <text class="hero-body">For APIs that want an image, such as a native tab bar icon, a Material symbol can be rendered to an image source.</text>
      <ResultRow testID="symbols-source-status" label="unstable_getMaterialSymbolSourceAsync" value={status()} />
      <Show when={source()}>
        {current => <image testID="symbols-source-image" source={current()} class="sym-image-icon" />}
      </Show>
    </Card>
  );
}

function PlaygroundCard(props: { color: string }) {
  const [type, setType] = createSignal<ISymbolType>('hierarchical');
  const [effect, setEffect] = createSignal<IEffectName>('pulse');
  const [isRepeating, setIsRepeating] = createSignal(true);
  const [size, setSize] = createSignal(64);
  const animation = createMemo(() => animationOf(effect(), isRepeating()));
  return (
    <Explorer testID="symbols-explorer" color={props.color}>
      <Card testID="symbols-playground" title="Every prop">
        <SymbolView
          testID="symbols-playground-view"
          name={{ ios: 'cloud.sun.rain.fill', android: 'partly_cloudy_day' }}
          type={type()}
          colors={type() === PALETTE_TYPE ? ['#f97316', '#38bdf8', '#e2e8f0'] : undefined}
          tintColor="#38bdf8"
          size={size()}
          scale="large"
          resizeMode="scaleAspectFit"
          animationSpec={animation()}
          class="sym-big"
        />
        <ChoiceRow testID="symbols-type" label="type (iOS)" color={props.color} value={type()} options={TYPES.map(item => ({ label: item, value: item }))} onChange={setType} />
        <ChoiceRow testID="symbols-effect" label="animationSpec.effect (iOS 17+)" color={props.color} value={effect()} options={EFFECTS.map(item => ({ label: item, value: item }))} onChange={setEffect} />
        <ToggleRow testID="symbols-repeating" label="animationSpec.repeating" value={isRepeating()} onChange={setIsRepeating} color={props.color} />
        <ChoiceRow testID="symbols-size" label="size" color={props.color} value={size()} options={[24, 48, 64, 96].map(item => ({ label: String(item), value: item }))} onChange={setSize} />
      </Card>
    </Explorer>
  );
}

export function SymbolsScreen() {
  const color = lineColorOf(ROUTE);
  return (
    <ScreenShell
      route={ROUTE}
      testID="symbols-scroll"
      title="Symbols"
      body="System icons by name: SF Symbols on iOS, Material Symbols on Android. One name pair replaces icon files and icon-font setup."
    >
      <TabBarScenario activeColor={color} />
      <WeightScenario color={color} />
      <AnimationScenario color={color} />
      <FallbackScenario />
      <MaterialSourceCard />
      <PlaygroundCard color={color} />
    </ScreenShell>
  );
}
