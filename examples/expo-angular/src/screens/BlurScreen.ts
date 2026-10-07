import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { BlurTargetView, BlurView } from '@symbiote-native/blur/angular';
import type { IBlurMethod, IBlurTint } from '@symbiote-native/blur/angular';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Explorer } from '../components/Explorer';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { photoUrl } from './image-assets';

const ROUTE = ROUTE_NAME.Blur;
const INTENSITY_STEP = 25;
const MAX_INTENSITY = 100;

const TINTS: readonly IBlurTint[] = [
  'default',
  'light',
  'dark',
  'extraLight',
  'regular',
  'prominent',
  'systemUltraThinMaterial',
  'systemThinMaterial',
  'systemMaterial',
  'systemThickMaterial',
  'systemChromeMaterial',
];
const METHODS: readonly IBlurMethod[] = [
  'none',
  'dimezisBlurView',
  'dimezisBlurViewSdk31Plus',
];

@Component({
  selector: 'BlurScreen',
  standalone: true,
  imports: [
    ActionButton,
    BlurTargetView,
    BlurView,
    Card,
    ChoiceRow,
    Explorer,
    ResultRow,
    Scenario,
    ScreenShell,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="blur-scroll"
      title="Blur"
      body="A native view that blurs whatever is behind it. On Android the blurred content has to sit inside a BlurTargetView, on iOS the target is a plain view and blur just works."
    >
      <Scenario
        testID="blur-card-scenario"
        title="Put readable text on a frosted glass card over a photo"
        why="Music players, weather and booking apps place a translucent card over a hero photo so the text stays readable while the picture still shows through."
        [steps]="cardSteps"
        expect="The photo is sharp everywhere except behind the card, where it is blurred. The blur gets stronger with each More blur press up to 100."
      >
        <view class="blur-frame">
          <BlurTargetView #cardTarget class="blur-fill">
            <image
              testID="blur-photo"
              [source]="photoSource"
              class="blur-fill"
            />
          </BlurTargetView>
          <BlurView
            testID="blur-card"
            [blurTarget]="cardTarget"
            blurMethod="dimezisBlurView"
            tint="dark"
            [intensity]="intensity()"
            class="blur-card"
          >
            <text class="blur-card-title">Now playing</text>
            <text class="blur-card-body"
              >The background behind this card is blurred</text
            >
          </BlurView>
        </view>
        <ResultRow
          testID="blur-card-intensity"
          label="intensity"
          [value]="intensityLabel()"
        />
        <view class="button-row">
          <ActionButton
            testID="blur-less"
            title="Less blur"
            [color]="color"
            (press)="lessBlur()"
          />
          <ActionButton
            testID="blur-more"
            title="More blur"
            [color]="color"
            (press)="moreBlur()"
          />
        </view>
      </Scenario>

      <Scenario
        testID="blur-bar-scenario"
        title="Show a translucent bottom bar over a scrolling list"
        why="Tab bars and sticky headers in system apps blur the content that scrolls under them. This keeps the bar visible without a solid block hiding the list."
        [steps]="barSteps"
        expect="Rows are sharp above the bar and blurred while they are under it. The bar text stays readable the whole time."
      >
        <view class="blur-feed-frame">
          <BlurTargetView #barTarget class="blur-fill">
            <scroll-view
              testID="blur-feed"
              [nestedScrollEnabled]="true"
              class="blur-fill"
              contentContainerStyle="blur-feed-content"
            >
              @for (row of feedRows; track row) {
                <view class="blur-feed-row">
                  <text class="blur-feed-text">{{ row }}</text>
                </view>
              }
            </scroll-view>
          </BlurTargetView>
          <BlurView
            testID="blur-bar"
            [blurTarget]="barTarget"
            blurMethod="dimezisBlurView"
            tint="systemChromeMaterialDark"
            [intensity]="80"
            class="blur-bar"
          >
            <text class="blur-bar-text">Home · Search · Profile</text>
          </BlurView>
        </view>
      </Scenario>

      <Scenario
        testID="blur-spoiler-scenario"
        title="Hide a balance or a spoiler until the user taps"
        why="Banking and messaging apps blur sensitive values by default so nobody reads them over a shoulder. A tap reveals them."
        [steps]="spoilerSteps"
        expect="The amount is blurred into color noise at first, fully readable after Reveal, and blurred again after Hide."
      >
        <view class="blur-secret">
          <BlurTargetView #secretTarget class="blur-fill">
            <view class="blur-secret">
              <text class="blur-secret-text">Balance: $12,480.00</text>
            </view>
          </BlurTargetView>
          @if (!isRevealed()) {
            <BlurView
              testID="blur-secret-cover"
              [blurTarget]="secretTarget"
              blurMethod="dimezisBlurView"
              tint="light"
              [intensity]="100"
              class="blur-secret-cover"
            />
          }
        </view>
        <ActionButton
          testID="blur-secret-toggle"
          [title]="revealTitle()"
          [color]="color"
          (press)="isRevealed.set(!isRevealed())"
        />
      </Scenario>

      <Explorer testID="blur-explorer" [color]="color">
        <ng-template>
          <Card testID="blur-playground" title="Every prop">
            <view class="blur-frame">
              <BlurTargetView #playgroundTarget class="blur-fill">
                <image [source]="photoSource" class="blur-fill" />
              </BlurTargetView>
              <BlurView
                testID="blur-playground-view"
                [blurTarget]="playgroundTarget"
                [tint]="tint()"
                [blurMethod]="method()"
                [blurReductionFactor]="reduction()"
                [intensity]="70"
                class="blur-fill"
              />
            </view>
            <ChoiceRow
              testID="blur-tint"
              label="tint (iOS: all, Android: light, dark, default)"
              [color]="color"
              [options]="tintOptions"
              [(value)]="tint"
            />
            <ChoiceRow
              testID="blur-method"
              label="blurMethod (Android only, none = translucent view)"
              [color]="color"
              [options]="methodOptions"
              [(value)]="method"
            />
            <ChoiceRow
              testID="blur-reduction"
              label="blurReductionFactor (Android only)"
              [color]="color"
              [options]="reductionOptions"
              [(value)]="reduction"
            />
          </Card>
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class BlurScreen {
  readonly route = ROUTE;
  readonly color = lineColorOf(ROUTE);
  readonly photoSource = { uri: photoUrl('1039', 640) };
  readonly feedRows = [
    'Morning run',
    'Coffee with Anna',
    'Design review',
    'Groceries',
    'Call the bank',
    'Gym',
    'Dinner at 8',
  ];
  readonly cardSteps = [
    'Wait for the photo to load',
    'Press More blur and Less blur',
    'Compare how sharp the photo is behind the card and outside it',
  ];
  readonly barSteps = [
    'Scroll the list inside the frame up and down',
    'Watch the rows pass under the bottom bar',
  ];
  readonly spoilerSteps = [
    'Look at the balance, it is unreadable',
    'Press Reveal',
    'Press Hide',
  ];

  readonly tintOptions = TINTS.map(item => ({ label: item, value: item }));
  readonly methodOptions = METHODS.map(item => ({ label: item, value: item }));
  readonly reductionOptions = [2, 4, 8].map(item => ({
    label: String(item),
    value: item,
  }));

  readonly intensity = signal(60);
  readonly isRevealed = signal(false);
  readonly tint = signal<IBlurTint>('default');
  readonly method = signal<IBlurMethod>('dimezisBlurView');
  readonly reduction = signal(4);

  intensityLabel(): string {
    return String(this.intensity());
  }

  revealTitle(): string {
    return this.isRevealed() ? 'Hide' : 'Reveal';
  }

  lessBlur(): void {
    this.intensity.update(value => Math.max(1, value - INTENSITY_STEP));
  }

  moreBlur(): void {
    this.intensity.update(value =>
      Math.min(MAX_INTENSITY, value + INTENSITY_STEP),
    );
  }
}
