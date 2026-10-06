import { Component, computed, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  GlassContainer,
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from '@symbiote-native/glass-effect/angular';
import type {
  IGlassColorScheme,
  IGlassStyle,
} from '@symbiote-native/glass-effect/angular';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Explorer } from '../components/Explorer';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

type IStyleName = IGlassStyle;

const ROUTE = ROUTE_NAME.GlassEffect;
const MERGE_STEP = 14;
const STYLES: readonly IStyleName[] = ['regular', 'clear', 'none'];
const SCHEMES: readonly IGlassColorScheme[] = ['auto', 'light', 'dark'];
const LIKE_TINT = 'rgba(255, 59, 48, 0.7)';
const PANEL_TINT = 'rgba(10, 132, 255, 0.5)';

@Component({
  selector: 'GlassEffectScreen',
  standalone: true,
  imports: [
    ActionButton,
    Card,
    ChoiceRow,
    Explorer,
    GlassContainer,
    GlassView,
    ResultRow,
    Scenario,
    ScreenShell,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="glass-effect-scroll"
      title="Glass Effect"
      body="iOS 26 Liquid Glass as native views: floating controls, merging shapes and tinted surfaces. On Android and older iOS the same code renders plain views."
    >
      <Card testID="glass-availability-card" title="Is Liquid Glass here?">
        <ResultRow
          testID="glass-liquid-available"
          label="isLiquidGlassAvailable()"
          [value]="liquidAvailable"
        />
        <ResultRow
          testID="glass-api-available"
          label="isGlassEffectAPIAvailable()"
          [value]="apiAvailable"
        />
        <text class="hero-body">
          Both are true only on iOS 26 and later. Everywhere else the components
          render a plain view without the glass, so check before relying on the
          look.
        </text>
      </Card>

      <Scenario
        testID="glass-toolbar-scenario"
        title="Float tinted action buttons over a photo"
        why="Camera, maps and media apps put round or pill controls on top of content. Liquid Glass lets the content shine through and lights up under the finger."
        [steps]="toolbarSteps"
        expect="On iOS 26 the pills are see-through glass that reacts to the touch, and Like turns red. On other systems they are plain views with the same text."
      >
        <view class="glass-frame">
          <image
            testID="glass-photo"
            [source]="photoSource"
            class="glass-photo"
          />
          <GlassContainer
            testID="glass-toolbar"
            [spacing]="12"
            class="glass-toolbar"
          >
            <GlassView
              testID="glass-share"
              [isInteractive]="true"
              glassEffectStyle="regular"
              class="glass-pill"
            >
              <text class="glass-pill-text">Share</text>
            </GlassView>
            <pressable testID="glass-like-press" (press)="liked.set(!liked())">
              <GlassView
                testID="glass-like"
                [isInteractive]="true"
                glassEffectStyle="clear"
                [tintColor]="likeTint()"
                class="glass-pill"
              >
                <text class="glass-pill-text">{{ likeLabel() }}</text>
              </GlassView>
            </pressable>
          </GlassContainer>
        </view>
        <ResultRow
          testID="glass-like-state"
          label="Like state"
          [value]="likeState()"
        />
        <ActionButton
          testID="glass-like-reset"
          title="Reset"
          [color]="color"
          (press)="liked.set(false)"
        />
      </Scenario>

      <Scenario
        testID="glass-merge-scenario"
        title="Let nearby glass shapes melt into one"
        why="Inside a GlassContainer the effect treats close elements as one liquid surface, the way the iOS 26 toolbar groups buttons. The spacing value is the distance at which they start to merge."
        [steps]="mergeSteps"
        expect="On iOS 26 the two bubbles stretch toward each other and join into one blob when the gap drops below 40, then separate again. Elsewhere they only move."
      >
        <view class="glass-frame">
          <image [source]="photoSource" class="glass-photo" />
          <GlassContainer
            testID="glass-merge-container"
            [spacing]="40"
            class="glass-merge-row"
          >
            <GlassView
              testID="glass-merge-left"
              class="glass-bubble"
              [style]="gapStyle()"
            >
              <text class="glass-bubble-text">＋</text>
            </GlassView>
            <GlassView testID="glass-merge-right" class="glass-bubble">
              <text class="glass-bubble-text">♥</text>
            </GlassView>
          </GlassContainer>
        </view>
        <ResultRow testID="glass-merge-gap" label="gap" [value]="gapLabel()" />
        <view class="button-row">
          <ActionButton
            testID="glass-merge-closer"
            title="Closer"
            [color]="color"
            (press)="closer()"
          />
          <ActionButton
            testID="glass-merge-farther"
            title="Farther"
            [color]="color"
            (press)="farther()"
          />
        </view>
      </Scenario>

      <Explorer testID="glass-explorer" [color]="color">
        <ng-template>
          <Card testID="glass-playground" title="Every prop">
            <view class="glass-frame">
              <image [source]="photoSource" class="glass-photo" />
              <GlassView
                testID="glass-playground-view"
                [glassEffectStyle]="effectStyle()"
                [colorScheme]="scheme()"
                [tintColor]="panelTint()"
                [isInteractive]="true"
                class="glass-panel"
              >
                <text class="glass-panel-text"
                  >Change the style below: with animate on, the change takes 0.6
                  s</text
                >
              </GlassView>
            </view>
            <ChoiceRow
              testID="glass-style"
              label="glassEffectStyle"
              [color]="color"
              [options]="styleOptions"
              [(value)]="style"
            />
            <ChoiceRow
              testID="glass-scheme"
              label="colorScheme (overrides the system)"
              [color]="color"
              [options]="schemeOptions"
              [(value)]="scheme"
            />
            <ToggleRow
              testID="glass-animate"
              label="animate style changes"
              [color]="color"
              [(value)]="isAnimated"
            />
            <ToggleRow
              testID="glass-tint"
              label="tintColor (blue)"
              [color]="color"
              [(value)]="isTinted"
            />
          </Card>
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class GlassEffectScreen {
  readonly route = ROUTE;
  readonly color = lineColorOf(ROUTE);
  readonly photoSource = { uri: 'https://picsum.photos/id/1043/640/420' };
  readonly liquidAvailable = String(isLiquidGlassAvailable());
  readonly apiAvailable = String(isGlassEffectAPIAvailable());
  readonly toolbarSteps = [
    'Press and hold a glass pill without lifting',
    'Press Like and look at its tint',
  ];
  readonly mergeSteps = [
    'Press Closer until the gap is 4',
    'Press Farther until the gap is 60 again',
  ];
  readonly styleOptions = STYLES.map(item => ({ label: item, value: item }));
  readonly schemeOptions = SCHEMES.map(item => ({ label: item, value: item }));

  readonly liked = signal(false);
  readonly likeLabel = computed(() => (this.liked() ? 'Liked' : 'Like'));
  readonly likeState = computed(() => (this.liked() ? 'on' : 'off'));
  readonly likeTint = computed(() => (this.liked() ? LIKE_TINT : undefined));

  readonly gap = signal(60);
  readonly gapStyle = computed(() => ({ marginRight: this.gap() }));
  readonly gapLabel = computed(() => String(this.gap()));

  readonly style = signal<IStyleName>('regular');
  readonly scheme = signal<IGlassColorScheme>('auto');
  readonly isAnimated = signal(true);
  readonly isTinted = signal(false);
  readonly effectStyle = computed(() =>
    this.isAnimated()
      ? { style: this.style(), animate: true, animationDuration: 0.6 }
      : this.style(),
  );
  readonly panelTint = computed(() =>
    this.isTinted() ? PANEL_TINT : undefined,
  );

  closer(): void {
    this.gap.update(value => Math.max(4, value - MERGE_STEP));
  }

  farther(): void {
    this.gap.update(value => Math.min(60, value + MERGE_STEP));
  }
}
