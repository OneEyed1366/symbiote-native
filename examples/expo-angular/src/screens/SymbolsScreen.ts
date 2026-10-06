import { Component, computed, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  SymbolView,
  unstable_getMaterialSymbolSourceAsync,
} from '@symbiote-native/symbols/angular';
import type {
  IAnimationSpec,
  ISymbolName,
  ISymbolType,
} from '@symbiote-native/symbols/angular';
import thin from '@symbiote-native/symbols/androidWeights/thin';
import light from '@symbiote-native/symbols/androidWeights/light';
import regular from '@symbiote-native/symbols/androidWeights/regular';
import medium from '@symbiote-native/symbols/androidWeights/medium';
import semiBold from '@symbiote-native/symbols/androidWeights/semiBold';
import bold from '@symbiote-native/symbols/androidWeights/bold';
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

const ROUTE = ROUTE_NAME.Symbols;
const NO_EFFECT = 'none';
const PALETTE_TYPE: ISymbolType = 'palette';
const IDLE_TINT = '#64748b';
const LIKED_TINT = '#ef4444';

const TABS = [
  { label: 'Home', name: { ios: 'house.fill', android: 'home' } },
  { label: 'Search', name: { ios: 'magnifyingglass', android: 'search' } },
  { label: 'Alerts', name: { ios: 'bell.fill', android: 'notifications' } },
  {
    label: 'Profile',
    name: { ios: 'person.crop.circle.fill', android: 'person' },
  },
] as const;

const WEIGHTS = [
  { label: 'thin', ios: 'thin', android: thin },
  { label: 'light', ios: 'light', android: light },
  { label: 'regular', ios: 'regular', android: regular },
  { label: 'medium', ios: 'medium', android: medium },
  { label: 'semibold', ios: 'semibold', android: semiBold },
  { label: 'bold', ios: 'bold', android: bold },
] as const;

const TYPES: readonly ISymbolType[] = [
  'monochrome',
  'hierarchical',
  PALETTE_TYPE,
  'multicolor',
];
const EFFECTS = [NO_EFFECT, 'bounce', 'pulse', 'scale'] as const;
type IEffectName = (typeof EFFECTS)[number];

function animationOf(
  effect: IEffectName,
  isRepeating: boolean,
): IAnimationSpec | undefined {
  return effect === NO_EFFECT
    ? undefined
    : { effect: { type: effect }, repeating: isRepeating };
}

@Component({
  selector: 'SymbolsScreen',
  standalone: true,
  imports: [
    ActionButton,
    Card,
    ChoiceRow,
    Explorer,
    ResultRow,
    Scenario,
    ScreenShell,
    SymbolView,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="symbols-scroll"
      title="Symbols"
      body="System icons by name: SF Symbols on iOS, Material Symbols on Android. One name pair replaces icon files and icon-font setup."
    >
      <Scenario
        testID="symbols-tabs-scenario"
        title="Use system icons in a tab bar or a menu"
        why="One name pair gives the platform icon: an SF Symbol on iOS and a Material Symbol on Android. No icon files to export, and they scale and tint like text."
        [steps]="tabSteps"
        expect="The pressed tab icon and label turn to the accent color, the others stay grey. The icons look native to the platform."
      >
        <view testID="symbols-tabs" class="sym-tab-bar">
          @for (tab of tabs; track tab.label) {
            <pressable
              [testID]="'symbols-tab-' + tab.label"
              class="sym-tab"
              (press)="active.set(tab.label)"
            >
              <SymbolView
                [name]="tab.name"
                [size]="26"
                [tintColor]="tintOf(tab.label)"
              >
                <text>?</text>
              </SymbolView>
              <text class="sym-tab-label" [style]="labelStyle(tab.label)">{{
                tab.label
              }}</text>
            </pressable>
          }
        </view>
        <ResultRow
          testID="symbols-active-tab"
          label="Selected tab"
          [value]="active()"
        />
      </Scenario>

      <Scenario
        testID="symbols-weight-scenario"
        title="Match icon weight to the text next to it"
        why="A thin icon beside bold text looks broken. Weight lets a row of icons follow the text weight of the design."
        [steps]="weightSteps"
        expect="The strokes get visibly thicker from left to right, the sizes stay the same."
      >
        <view class="sym-weight-row">
          @for (item of weights; track item.label) {
            <view class="sym-weight-cell">
              <SymbolView
                [testID]="'symbols-weight-' + item.label"
                [name]="star"
                [weight]="item.weight"
                [size]="30"
                [tintColor]="color"
              />
              <text class="sym-weight-label">{{ item.label }}</text>
            </view>
          }
        </view>
      </Scenario>

      <Scenario
        testID="symbols-animation-scenario"
        title="Make a like or a download button feel alive"
        why="A small bounce on press confirms the tap. SF Symbols animate natively, no animation code or Lottie file is needed (iOS 17 and later)."
        [steps]="animationSteps"
        expect="On iOS 17+ the heart bounces on every press and turns red or grey. On Android it only changes color."
      >
        <pressable testID="symbols-like" (press)="like()">
          @for (play of playKeys(); track play) {
            <SymbolView
              [name]="heartName()"
              [size]="48"
              [tintColor]="heartTint()"
              [animationSpec]="bounce"
              class="sym-big"
            />
          }
        </pressable>
        <ResultRow
          testID="symbols-like-state"
          label="Liked"
          [value]="likedLabel()"
        />
        <ActionButton
          testID="symbols-like-reset"
          title="Reset"
          [color]="color"
          (press)="liked.set(false)"
        />
      </Scenario>

      <Scenario
        testID="symbols-fallback-scenario"
        title="Show something when a platform has no symbol"
        why="Some SF Symbols have no Material twin. With a name for one platform only, the fallback renders on the other instead of an empty gap."
        [steps]="fallbackSteps"
        expect="The iOS-only symbol shows the gear on iOS and the text fallback on Android. The Android-only symbol shows its glyph on Android and the fallback on iOS."
      >
        <view class="capability-row">
          <text class="capability-label">name: only ios</text>
          <SymbolView
            testID="symbols-ios-only"
            [name]="iosOnly"
            [size]="28"
            tintColor="#e2e8f0"
          >
            <text class="value-text">no symbol here</text>
          </SymbolView>
        </view>
        <view class="capability-row">
          <text class="capability-label">name: only android</text>
          <SymbolView
            testID="symbols-android-only"
            [name]="androidOnly"
            [size]="28"
            tintColor="#e2e8f0"
          >
            <text class="value-text">no symbol here</text>
          </SymbolView>
        </view>
      </Scenario>

      <Card testID="symbols-source-card" title="Symbol as an image (Android)">
        <text class="hero-body"
          >For APIs that want an image, such as a native tab bar icon, a
          Material symbol can be rendered to an image source.</text
        >
        <ResultRow
          testID="symbols-source-status"
          label="unstable_getMaterialSymbolSourceAsync"
          [value]="sourceStatus()"
        />
        @if (source(); as current) {
          <image
            testID="symbols-source-image"
            [source]="current"
            class="sym-image-icon"
          />
        }
      </Card>

      <Explorer testID="symbols-explorer" [color]="color">
        <ng-template>
          <Card testID="symbols-playground" title="Every prop">
            <SymbolView
              testID="symbols-playground-view"
              [name]="weather"
              [type]="type()"
              [colors]="playgroundColors()"
              tintColor="#38bdf8"
              [size]="size()"
              scale="large"
              resizeMode="scaleAspectFit"
              [animationSpec]="animation()"
              class="sym-big"
            />
            <ChoiceRow
              testID="symbols-type"
              label="type (iOS)"
              [color]="color"
              [options]="typeOptions"
              [(value)]="type"
            />
            <ChoiceRow
              testID="symbols-effect"
              label="animationSpec.effect (iOS 17+)"
              [color]="color"
              [options]="effectOptions"
              [(value)]="effect"
            />
            <ToggleRow
              testID="symbols-repeating"
              label="animationSpec.repeating"
              [color]="color"
              [(value)]="isRepeating"
            />
            <ChoiceRow
              testID="symbols-size"
              label="size"
              [color]="color"
              [options]="sizeOptions"
              [(value)]="size"
            />
          </Card>
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class SymbolsScreen implements OnInit {
  readonly route = ROUTE;
  readonly color = lineColorOf(ROUTE);
  readonly tabs = TABS;
  readonly weights = WEIGHTS.map(item => ({
    label: item.label,
    weight: { ios: item.ios, android: item.android },
  }));
  readonly star: ISymbolName = { ios: 'star.fill', android: 'star' };
  readonly weather: ISymbolName = {
    ios: 'cloud.sun.rain.fill',
    android: 'partly_cloudy_day',
  };
  readonly iosOnly: ISymbolName = { ios: 'gearshape.fill' };
  readonly androidOnly: ISymbolName = { android: 'settings' };
  readonly bounce: IAnimationSpec = { effect: { type: 'bounce' } };
  readonly tabSteps = [
    'Press each tab in turn',
    'Compare the icon shapes with the system apps on this device',
  ];
  readonly weightSteps = [
    'Look at the row from thin to bold',
    'Compare the stroke thickness of the first and last icon',
  ];
  readonly animationSteps = ['Press the heart a few times'];
  readonly fallbackSteps = ['Look at both rows on iOS, then on Android'];
  readonly typeOptions = TYPES.map(item => ({ label: item, value: item }));
  readonly effectOptions = EFFECTS.map(item => ({ label: item, value: item }));
  readonly sizeOptions = [24, 48, 64, 96].map(item => ({
    label: String(item),
    value: item,
  }));

  readonly active = signal<string>(TABS[0].label);
  readonly liked = signal(false);
  readonly plays = signal(0);
  // A new key per press re-creates the symbol, so its bounce plays again
  readonly playKeys = computed(() => [this.plays()]);
  readonly heartName = computed<ISymbolName>(() => ({
    ios: this.liked() ? 'heart.fill' : 'heart',
    android: 'favorite',
  }));
  readonly heartTint = computed(() => (this.liked() ? LIKED_TINT : IDLE_TINT));
  readonly likedLabel = computed(() => String(this.liked()));

  readonly source = signal<{ uri: string } | null>(null);
  readonly sourceStatus = signal('rendering…');

  readonly type = signal<ISymbolType>('hierarchical');
  readonly effect = signal<IEffectName>('pulse');
  readonly isRepeating = signal(true);
  readonly size = signal(64);
  readonly animation = computed(() =>
    animationOf(this.effect(), this.isRepeating()),
  );
  readonly playgroundColors = computed(() =>
    this.type() === PALETTE_TYPE
      ? ['#f97316', '#38bdf8', '#e2e8f0']
      : undefined,
  );

  tintOf(label: string): string {
    return label === this.active() ? this.color : IDLE_TINT;
  }

  labelStyle(label: string): { color: string } {
    return { color: this.tintOf(label) };
  }

  like(): void {
    this.liked.update(value => !value);
    this.plays.update(value => value + 1);
  }

  async ngOnInit(): Promise<void> {
    try {
      const result = await unstable_getMaterialSymbolSourceAsync(
        'home',
        40,
        '#ffffff',
      );
      this.source.set(result);
      this.sourceStatus.set(
        result === null
          ? 'null: iOS has no Material font path'
          : `${result.width}x${result.height}`,
      );
    } catch (error) {
      this.sourceStatus.set(
        `failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
