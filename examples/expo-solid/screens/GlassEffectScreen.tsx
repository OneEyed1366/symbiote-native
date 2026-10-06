import { createSignal } from 'solid-js';
import {
  GlassContainer,
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from '@symbiote-native/glass-effect/solid';
import type { IGlassColorScheme, IGlassStyle } from '@symbiote-native/glass-effect/solid';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ScreenShell, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.GlassEffect;
const PHOTO_URI = 'https://picsum.photos/id/1043/640/420';
const MERGE_STEP = 14;

type IStyleName = IGlassStyle;
const STYLES: readonly IStyleName[] = ['regular', 'clear', 'none'];
const SCHEMES: readonly IGlassColorScheme[] = ['auto', 'light', 'dark'];

function AvailabilityCard() {
  return (
    <Card testID="glass-availability-card" title="Is Liquid Glass here?">
      <ResultRow testID="glass-liquid-available" label="isLiquidGlassAvailable()" value={String(isLiquidGlassAvailable())} />
      <ResultRow testID="glass-api-available" label="isGlassEffectAPIAvailable()" value={String(isGlassEffectAPIAvailable())} />
      <text class="hero-body">
        Both are true only on iOS 26 and later. Everywhere else the components render a plain view without the glass, so check
        before relying on the look.
      </text>
    </Card>
  );
}

function ToolbarScenario(props: { color: string }) {
  const [liked, setLiked] = createSignal(false);
  return (
    <Scenario
      testID="glass-toolbar-scenario"
      title="Float tinted action buttons over a photo"
      why="Camera, maps and media apps put round or pill controls on top of content. Liquid Glass lets the content shine through and lights up under the finger."
      steps={['Press and hold a glass pill without lifting', 'Press Like and look at its tint']}
      expect="On iOS 26 the pills are see-through glass that reacts to the touch, and Like turns red. On other systems they are plain views with the same text."
    >
      <view class="glass-frame">
        <image testID="glass-photo" source={{ uri: PHOTO_URI }} class="glass-photo" />
        <GlassContainer testID="glass-toolbar" spacing={12} class="glass-toolbar">
          <GlassView testID="glass-share" isInteractive glassEffectStyle="regular" class="glass-pill">
            <text class="glass-pill-text">Share</text>
          </GlassView>
          <pressable testID="glass-like-press" onPress={() => setLiked(value => !value)}>
            <GlassView
              testID="glass-like"
              isInteractive
              glassEffectStyle="clear"
              tintColor={liked() ? 'rgba(255, 59, 48, 0.7)' : undefined}
              class="glass-pill"
            >
              <text class="glass-pill-text">{liked() ? 'Liked' : 'Like'}</text>
            </GlassView>
          </pressable>
        </GlassContainer>
      </view>
      <ResultRow testID="glass-like-state" label="Like state" value={liked() ? 'on' : 'off'} />
      <ActionButton testID="glass-like-reset" title="Reset" color={props.color} onPress={() => setLiked(false)} />
    </Scenario>
  );
}

function MergeScenario(props: { color: string }) {
  const [gap, setGap] = createSignal(60);
  return (
    <Scenario
      testID="glass-merge-scenario"
      title="Let nearby glass shapes melt into one"
      why="Inside a GlassContainer the effect treats close elements as one liquid surface, the way the iOS 26 toolbar groups buttons. The spacing value is the distance at which they start to merge."
      steps={['Press Closer until the gap is 4', 'Press Farther until the gap is 60 again']}
      expect="On iOS 26 the two bubbles stretch toward each other and join into one blob when the gap drops below 40, then separate again. Elsewhere they only move."
    >
      <view class="glass-frame">
        <image source={{ uri: PHOTO_URI }} class="glass-photo" />
        <GlassContainer testID="glass-merge-container" spacing={40} class="glass-merge-row">
          <GlassView testID="glass-merge-left" class="glass-bubble" style={{ marginRight: gap() }}>
            <text class="glass-bubble-text">＋</text>
          </GlassView>
          <GlassView testID="glass-merge-right" class="glass-bubble">
            <text class="glass-bubble-text">♥</text>
          </GlassView>
        </GlassContainer>
      </view>
      <ResultRow testID="glass-merge-gap" label="gap" value={String(gap())} />
      <view class="button-row">
        <ActionButton testID="glass-merge-closer" title="Closer" color={props.color} onPress={() => setGap(value => Math.max(4, value - MERGE_STEP))} />
        <ActionButton testID="glass-merge-farther" title="Farther" color={props.color} onPress={() => setGap(value => Math.min(60, value + MERGE_STEP))} />
      </view>
    </Scenario>
  );
}

function StyleExplorer(props: { color: string }) {
  const [style, setStyle] = createSignal<IStyleName>('regular');
  const [scheme, setScheme] = createSignal<IGlassColorScheme>('auto');
  const [isAnimated, setIsAnimated] = createSignal(true);
  const [isTinted, setIsTinted] = createSignal(false);
  return (
    <Explorer testID="glass-explorer" color={props.color}>
      <Card testID="glass-playground" title="Every prop">
        <view class="glass-frame">
          <image source={{ uri: PHOTO_URI }} class="glass-photo" />
          <GlassView
            testID="glass-playground-view"
            glassEffectStyle={isAnimated() ? { style: style(), animate: true, animationDuration: 0.6 } : style()}
            colorScheme={scheme()}
            tintColor={isTinted() ? 'rgba(10, 132, 255, 0.5)' : undefined}
            isInteractive
            class="glass-panel"
          >
            <text class="glass-panel-text">Change the style below: with animate on, the change takes 0.6 s</text>
          </GlassView>
        </view>
        <ChoiceRow testID="glass-style" label="glassEffectStyle" color={props.color} value={style()} options={STYLES.map(item => ({ label: item, value: item }))} onChange={setStyle} />
        <ChoiceRow testID="glass-scheme" label="colorScheme (overrides the system)" color={props.color} value={scheme()} options={SCHEMES.map(item => ({ label: item, value: item }))} onChange={setScheme} />
        <ToggleRow testID="glass-animate" label="animate style changes" value={isAnimated()} onChange={setIsAnimated} color={props.color} />
        <ToggleRow testID="glass-tint" label="tintColor (blue)" value={isTinted()} onChange={setIsTinted} color={props.color} />
      </Card>
    </Explorer>
  );
}

export function GlassEffectScreen() {
  const color = lineColorOf(ROUTE);
  return (
    <ScreenShell
      route={ROUTE}
      testID="glass-effect-scroll"
      title="Glass Effect"
      body="iOS 26 Liquid Glass as native views: floating controls, merging shapes and tinted surfaces. On Android and older iOS the same code renders plain views."
    >
      <AvailabilityCard />
      <ToolbarScenario color={color} />
      <MergeScenario color={color} />
      <StyleExplorer color={color} />
    </ScreenShell>
  );
}
