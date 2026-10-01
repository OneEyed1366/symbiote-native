import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  getBackgroundColorAsync,
  setBackgroundColorAsync,
} from '@symbiote-native/system-ui/angular';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const PRESET_RED = '#ef4444';
const PRESET_BLUE = '#3b82f6';

@Component({
  selector: 'SystemUiScreen',
  standalone: true,
  imports: [ActionButton, Scenario, SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="system-ui-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="'line-tag line-tag-' + lineInfo.line">
          <text class="line-tag-text"
            >{{ lineInfo.code }} · {{ lineInfo.label }}</text
          >
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="badgeStyle">
            <text class="hero-badge-text">{{ lineInfo.code }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">System UI</text>
            <text class="hero-body">
              Set the color of the window behind your app, so keyboard
              animations, overscroll and screen transitions do not flash white
              against a dark theme.
            </text>
          </view>
        </view>

        <Scenario
          testID="system-ui-scenario"
          title="Match the window background to the app theme"
          why="The root view shows through during overscroll, rotation and keyboard transitions. Setting it to the theme color removes the white flash in dark mode."
          [steps]="scenarioSteps"
          expect="The color row shows the new value and the color appears wherever the window shows through. Reset returns the default."
        />

        <view testID="system-ui-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Root view background</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Current color</text>
            <text class="value-text">{{ backgroundColor() ?? 'not set' }}</text>
          </view>
          <ActionButton
            testID="system-ui-red-button"
            title="Red"
            [color]="lineColor"
            (press)="applyColor(presetRed)"
          />
          <ActionButton
            testID="system-ui-blue-button"
            title="Blue"
            [color]="lineColor"
            (press)="applyColor(presetBlue)"
          />
          <ActionButton
            testID="system-ui-reset-button"
            title="Reset"
            [color]="lineColor"
            (press)="applyColor(null)"
          />
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class SystemUiScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SystemUi];
  readonly lineColor = LINE_COLOR['system-ui'];
  readonly badgeStyle = { backgroundColor: LINE_COLOR['system-ui'] };
  readonly presetRed = PRESET_RED;
  readonly presetBlue = PRESET_BLUE;
  readonly scenarioSteps = [
    'Press Red or Blue',
    'Overscroll the list or rotate the phone',
    'Press Reset',
  ];

  readonly backgroundColor = signal<string | null>(null);

  constructor() {
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    const color = await getBackgroundColorAsync();
    this.backgroundColor.set(color === null ? null : String(color));
  }

  applyColor(color: string | null): void {
    void setBackgroundColorAsync(color).then(() => this.refresh());
  }
}
