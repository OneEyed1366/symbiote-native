import { Component, computed, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { isAvailableAsync } from '@symbiote-native/keep-awake/angular';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { KeepAwakeHolder } from './KeepAwakeHolder';

@Component({
  selector: 'KeepAwakeScreen',
  standalone: true,
  imports: [KeepAwakeHolder, Scenario, SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="keep-awake-scroll"
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
            <text class="hero-title">Keep Awake</text>
            <text class="hero-body">
              Stop the screen from dimming and locking while a component is
              mounted, for a recipe, a workout timer, a video or a boarding
              pass.
            </text>
          </view>
        </view>

        <Scenario
          testID="keep-awake-scenario"
          title="Keep the screen on while someone follows a recipe or a workout"
          why="Hands that are busy cannot tap the screen to wake it. The lock lives exactly as long as the component that asked for it, so it cannot be left on by mistake."
          [steps]="scenarioSteps"
          expect="With the switch on the screen stays lit, and with it off the phone dims and locks after its normal timeout."
        />

        <view testID="keep-awake-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Keep screen awake</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Available</text>
            <text class="value-text">{{ availableLabel() }}</text>
          </view>
          <view testID="keep-awake-toggle-row" class="capability-row">
            <text class="capability-label">Keep screen awake</text>
            <switch
              testID="keep-awake-switch"
              [value]="isKeepAwakeOn()"
              [trackColor]="trackColor"
              (valueChange)="isKeepAwakeOn.set($event)"
            />
          </view>
          @if (isKeepAwakeOn()) {
            <KeepAwakeHolder />
          }
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class KeepAwakeScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.KeepAwake];
  readonly badgeStyle = { backgroundColor: LINE_COLOR['keep-awake'] };
  readonly trackColor = { true: LINE_COLOR['keep-awake'] };
  readonly scenarioSteps = [
    'Turn the switch on',
    'Put the phone down and wait past the auto-lock time',
    'Turn the switch off and wait again',
  ];

  readonly isKeepAwakeOn = signal(false);
  private readonly isAvailable = signal<boolean | null>(null);

  readonly availableLabel = computed(() => {
    const isAvailable = this.isAvailable();
    if (isAvailable === null) return 'checking…';
    return isAvailable ? 'Yes' : 'No';
  });

  constructor() {
    void isAvailableAsync().then(value => this.isAvailable.set(value));
  }
}
