import { Component, computed, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { LinearGradient } from '@symbiote-native/linear-gradient/angular';
import type { ILinearGradientPoint } from '@symbiote-native/linear-gradient/angular';
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

type IStops = readonly [string, string, ...string[]];
type IPreset = { name: string; colors: IStops };
type IDirection = {
  name: string;
  start: ILinearGradientPoint;
  end: ILinearGradientPoint;
};

const ROUTE = ROUTE_NAME.LinearGradient;
const PHOTO_SOURCE = { uri: 'https://picsum.photos/id/1018/640/360' };
const PROGRESS_STEP = 20;

const PRESETS: readonly IPreset[] = [
  { name: 'sunset', colors: ['#f97316', '#db2777', '#4c1d95'] },
  { name: 'ocean', colors: ['#22d3ee', '#2563eb'] },
  { name: 'mint', colors: ['#bbf7d0', '#14b8a6'] },
  {
    name: 'rainbow',
    colors: ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#a855f7'],
  },
];

const DIRECTIONS: readonly IDirection[] = [
  { name: 'down', start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
  { name: 'right', start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  { name: 'diagonal', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  { name: 'up', start: { x: 0.5, y: 1 }, end: { x: 0.5, y: 0 } },
];

// Every stop pulled into the first half of the line, so the last color fills the rest
function squeezedLocations([, , ...rest]: IStops): readonly [
  number,
  number,
  ...number[],
] {
  const last = rest.length + 1;
  return [0, 0.5 / last, ...rest.map((_, index) => (0.5 * (index + 2)) / last)];
}

@Component({
  selector: 'LinearGradientScreen',
  standalone: true,
  imports: [
    ActionButton,
    Card,
    ChoiceRow,
    Explorer,
    LinearGradient,
    ResultRow,
    Scenario,
    ScreenShell,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="linear-gradient-scroll"
      title="Linear Gradient"
      body="A native view that paints a multi-color blend behind its children. Used for banners, photo scrims, progress bars and buttons."
    >
      <Scenario
        testID="linear-gradient-banner-scenario"
        title="Give a promo banner or a profile header a branded background"
        why="A gradient is the cheapest way to make a flat card feel designed: onboarding heroes, plan cards and headers use two or three brand colors on a diagonal."
        [steps]="bannerSteps"
        expect="The banner shows an orange to purple diagonal blend under the text. The text stays on top and readable, and the gradient stretches with the card."
      >
        <LinearGradient
          testID="linear-gradient-banner"
          [colors]="bannerColors"
          [start]="bannerStart"
          [end]="bannerEnd"
          class="lg-banner"
        >
          <text class="lg-banner-title">Summer plan, 30% off</text>
          <text class="lg-banner-body"
            >Children of this view paint above the gradient</text
          >
        </LinearGradient>
      </Scenario>

      <Scenario
        testID="linear-gradient-scrim-scenario"
        title="Keep a caption readable over any photo"
        why="White text over a bright photo is unreadable. Cover the bottom of the picture with a transparent to black gradient, as feeds, galleries and video cards do."
        [steps]="scrimSteps"
        expect="The photo stays clear at the top and darkens smoothly towards the bottom, where the white caption is easy to read."
      >
        <view class="lg-photo-frame">
          <image
            testID="linear-gradient-scrim-photo"
            [source]="photoSource"
            class="lg-photo"
          />
          <LinearGradient
            testID="linear-gradient-scrim"
            [colors]="scrimColors"
            [locations]="scrimLocations"
            class="lg-scrim"
          >
            <text class="lg-caption">Mountain lake at dawn</text>
          </LinearGradient>
        </view>
      </Scenario>

      <Scenario
        testID="linear-gradient-progress-scenario"
        title="Draw a progress bar or a gradient button"
        why="Progress bars, level meters and call-to-action buttons use a short gradient strip whose width follows a value."
        [steps]="progressSteps"
        expect="The filled strip grows and shrinks in 20% steps between 0% and 100%. The gradient button reacts to the press and fills the bar."
      >
        <view class="lg-track">
          <LinearGradient
            testID="linear-gradient-progress-fill"
            [colors]="progressColors"
            [start]="horizontal.start"
            [end]="horizontal.end"
            class="lg-fill"
            [style]="fillStyle()"
          />
        </view>
        <ResultRow
          testID="linear-gradient-progress-value"
          label="Progress"
          [value]="percentLabel()"
        />
        <view class="button-row">
          <ActionButton
            testID="linear-gradient-progress-minus"
            [title]="minusTitle"
            [color]="color"
            (press)="step(-1)"
          />
          <ActionButton
            testID="linear-gradient-progress-plus"
            [title]="plusTitle"
            [color]="color"
            (press)="step(1)"
          />
        </view>
        <pressable testID="linear-gradient-button" (press)="percent.set(100)">
          <LinearGradient
            [colors]="buttonColors"
            [start]="horizontal.start"
            [end]="horizontal.end"
            class="lg-button"
          >
            <text class="lg-button-text">Finish setup</text>
          </LinearGradient>
        </pressable>
      </Scenario>

      <Explorer testID="linear-gradient-explorer" [color]="color">
        <ng-template>
          <Card testID="linear-gradient-playground" title="Every prop">
            <LinearGradient
              testID="linear-gradient-playground-view"
              [colors]="preset().colors"
              [locations]="locations()"
              [start]="direction().start"
              [end]="direction().end"
              [dither]="isDithered()"
              class="lg-playground"
            />
            <ChoiceRow
              testID="linear-gradient-preset"
              label="colors"
              [color]="color"
              [options]="presetOptions"
              [(value)]="presetName"
            />
            <ChoiceRow
              testID="linear-gradient-direction"
              label="start → end"
              [color]="color"
              [options]="directionOptions"
              [(value)]="directionName"
            />
            <ToggleRow
              testID="linear-gradient-locations"
              label="locations: spread evenly (off = squeezed into the first half)"
              [color]="color"
              [(value)]="isEvenlySpaced"
            />
            <ToggleRow
              testID="linear-gradient-dither"
              label="dither (Android only)"
              [color]="color"
              [(value)]="isDithered"
            />
          </Card>
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class LinearGradientScreen {
  readonly route = ROUTE;
  readonly color = lineColorOf(ROUTE);
  readonly photoSource = PHOTO_SOURCE;
  readonly minusTitle = `-${PROGRESS_STEP}%`;
  readonly plusTitle = `+${PROGRESS_STEP}%`;

  readonly bannerSteps = [
    'Look at the banner',
    'Rotate the device or compare a small and a large screen',
  ];
  readonly scrimSteps = [
    'Wait for the photo to load',
    'Read the caption at the bottom of it',
  ];
  readonly progressSteps = [
    'Press +20% and -20% a few times',
    'Press the gradient button',
  ];

  readonly bannerColors = ['#f97316', '#db2777', '#4c1d95'] as const;
  readonly bannerStart = { x: 0, y: 0 };
  readonly bannerEnd = { x: 1, y: 1 };
  readonly scrimColors = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)'] as const;
  readonly scrimLocations = [0.3, 1] as const;
  readonly progressColors = ['#22c55e', '#facc15', '#ef4444'] as const;
  readonly buttonColors = ['#6366f1', '#a855f7'] as const;
  readonly horizontal = { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } };

  readonly percent = signal(35);
  readonly fillStyle = computed(() => ({ width: `${this.percent()}%` }));
  readonly percentLabel = computed(() => `${this.percent()}%`);

  readonly presetOptions = PRESETS.map(item => ({
    label: item.name,
    value: item.name,
  }));
  readonly directionOptions = DIRECTIONS.map(item => ({
    label: item.name,
    value: item.name,
  }));
  readonly presetName = signal(PRESETS[0].name);
  readonly directionName = signal(DIRECTIONS[2].name);
  readonly isEvenlySpaced = signal(true);
  readonly isDithered = signal(true);
  readonly preset = computed(
    () => PRESETS.find(item => item.name === this.presetName()) ?? PRESETS[0],
  );
  readonly direction = computed(
    () =>
      DIRECTIONS.find(item => item.name === this.directionName()) ??
      DIRECTIONS[0],
  );
  readonly locations = computed(() =>
    this.isEvenlySpaced() ? null : squeezedLocations(this.preset().colors),
  );

  step(direction: 1 | -1): void {
    this.percent.update(value =>
      direction > 0
        ? Math.min(100, value + PROGRESS_STEP)
        : Math.max(0, value - PROGRESS_STEP),
    );
  }
}
