import { useEffect, useState } from 'react';
import { SymbolView, unstable_getMaterialSymbolSourceAsync } from '@symbiote-native/symbols/react';
import type { IAnimationSpec, ISymbolType } from '@symbiote-native/symbols/react';
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

const TYPES: readonly ISymbolType[] = ['monochrome', 'hierarchical', 'palette', 'multicolor'];
const EFFECTS = [NO_EFFECT, 'bounce', 'pulse', 'scale'] as const;
type IEffectName = (typeof EFFECTS)[number];

function TabBarScenario({ activeColor }: { activeColor: string }) {
  const [active, setActive] = useState<string>(TABS[0].label);
  return (
    <Scenario
      testID="symbols-tabs-scenario"
      title="Use system icons in a tab bar or a menu"
      why="One name pair gives the platform icon: an SF Symbol on iOS and a Material Symbol on Android. No icon files to export, and they scale and tint like text."
      steps={['Press each tab in turn', 'Compare the icon shapes with the system apps on this device']}
      expect="The pressed tab icon and label turn to the accent color, the others stay grey. The icons look native to the platform."
    >
      <view testID="symbols-tabs" className="sym-tab-bar">
        {TABS.map(tab => {
          const tint = tab.label === active ? activeColor : '#64748b';
          return (
            <pressable key={tab.label} testID={`symbols-tab-${tab.label}`} className="sym-tab" onPress={() => setActive(tab.label)}>
              <SymbolView name={tab.name} size={TAB_ICON_SIZE} tintColor={tint} fallback={<text>?</text>} />
              <text className="sym-tab-label" style={{ color: tint }}>{tab.label}</text>
            </pressable>
          );
        })}
      </view>
      <ResultRow testID="symbols-active-tab" label="Selected tab" value={active} />
    </Scenario>
  );
}

function WeightScenario({ color }: { color: string }) {
  return (
    <Scenario
      testID="symbols-weight-scenario"
      title="Match icon weight to the text next to it"
      why="A thin icon beside bold text looks broken. Weight lets a row of icons follow the text weight of the design."
      steps={['Look at the row from thin to bold', 'Compare the stroke thickness of the first and last icon']}
      expect="The strokes get visibly thicker from left to right, the sizes stay the same."
    >
      <view className="sym-weight-row">
        {WEIGHTS.map(item => (
          <view key={item.label} className="sym-weight-cell">
            <SymbolView
              testID={`symbols-weight-${item.label}`}
              name={{ ios: 'star.fill', android: 'star' }}
              weight={{ ios: item.ios, android: item.android }}
              size={30}
              tintColor={color}
            />
            <text className="sym-weight-label">{item.label}</text>
          </view>
        ))}
      </view>
    </Scenario>
  );
}

function animationOf(effect: IEffectName, isRepeating: boolean): IAnimationSpec | undefined {
  return effect === NO_EFFECT ? undefined : { effect: { type: effect }, repeating: isRepeating };
}

function AnimationScenario({ color }: { color: string }) {
  const [liked, setLiked] = useState(false);
  const [plays, setPlays] = useState(0);
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
        <SymbolView
          key={plays}
          name={{ ios: liked ? 'heart.fill' : 'heart', android: 'favorite' }}
          size={48}
          tintColor={liked ? '#ef4444' : '#64748b'}
          animationSpec={{ effect: { type: 'bounce' } }}
          className="sym-big"
        />
      </pressable>
      <ResultRow testID="symbols-like-state" label="Liked" value={String(liked)} />
      <ActionButton testID="symbols-like-reset" title="Reset" color={color} onPress={() => setLiked(false)} />
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
      <view className="capability-row">
        <text className="capability-label">name: only ios</text>
        <SymbolView testID="symbols-ios-only" name={{ ios: 'gearshape.fill' }} size={28} tintColor="#e2e8f0" fallback={<text className="value-text">no symbol here</text>} />
      </view>
      <view className="capability-row">
        <text className="capability-label">name: only android</text>
        <SymbolView testID="symbols-android-only" name={{ android: 'settings' }} size={28} tintColor="#e2e8f0" fallback={<text className="value-text">no symbol here</text>} />
      </view>
    </Scenario>
  );
}

function MaterialSourceCard() {
  const [source, setSource] = useState<{ uri: string } | null>(null);
  const [status, setStatus] = useState('rendering…');
  useEffect(() => {
    unstable_getMaterialSymbolSourceAsync('home', 40, '#ffffff')
      .then(result => {
        setSource(result);
        setStatus(result === null ? 'null: iOS has no Material font path' : `${result.width}x${result.height}`);
      })
      .catch((error: Error) => setStatus(`failed: ${error.message}`));
  }, []);
  return (
    <Card testID="symbols-source-card" title="Symbol as an image (Android)">
      <text className="hero-body">For APIs that want an image, such as a native tab bar icon, a Material symbol can be rendered to an image source.</text>
      <ResultRow testID="symbols-source-status" label="unstable_getMaterialSymbolSourceAsync" value={status} />
      {source !== null && <image testID="symbols-source-image" source={source} className="sym-image-icon" />}
    </Card>
  );
}

function PlaygroundCard({ color }: { color: string }) {
  const [type, setType] = useState<ISymbolType>('hierarchical');
  const [effect, setEffect] = useState<IEffectName>('pulse');
  const [isRepeating, setIsRepeating] = useState(true);
  const [size, setSize] = useState(64);
  return (
    <Explorer testID="symbols-explorer" color={color}>
      <Card testID="symbols-playground" title="Every prop">
        <SymbolView
          testID="symbols-playground-view"
          name={{ ios: 'cloud.sun.rain.fill', android: 'partly_cloudy_day' }}
          type={type}
          colors={type === 'palette' ? ['#f97316', '#38bdf8', '#e2e8f0'] : undefined}
          tintColor="#38bdf8"
          size={size}
          scale="large"
          resizeMode="scaleAspectFit"
          animationSpec={animationOf(effect, isRepeating)}
          className="sym-big"
        />
        <ChoiceRow testID="symbols-type" label="type (iOS)" color={color} value={type} options={TYPES.map(item => ({ label: item, value: item }))} onChange={setType} />
        <ChoiceRow testID="symbols-effect" label="animationSpec.effect (iOS 17+)" color={color} value={effect} options={EFFECTS.map(item => ({ label: item, value: item }))} onChange={setEffect} />
        <ToggleRow testID="symbols-repeating" label="animationSpec.repeating" value={isRepeating} onChange={setIsRepeating} color={color} />
        <ChoiceRow testID="symbols-size" label="size" color={color} value={size} options={[24, 48, 64, 96].map(item => ({ label: String(item), value: item }))} onChange={setSize} />
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
