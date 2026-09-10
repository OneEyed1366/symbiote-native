import { Component, Injector, effect, inject, signal } from '@angular/core';
import {
  SafeAreaViewElement,
  ScrollViewElement,
  Text,
  View,
} from '@symbiote-native/angular';
import {
  KeepAwakeService,
  deactivateKeepAwake,
  isAvailableAsync,
} from '@symbiote-native/keep-awake/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

const KEEP_AWAKE_DEMO_TAG = 'keep-awake-screen-demo';

/**
 * @symbiote-native/keep-awake canary demo: an isAvailableAsync() capability row plus a toggle
 * driving KeepAwakeService's own connect()/teardown pattern. Every other screen's *Service calls
 * connect() once from a field initializer, active for the component's whole lifetime — a fit for
 * a live data stream, but keep-awake's connect() is a pure side effect with no signal to expose,
 * so there's nothing to gate on a field initializer alone. This screen instead re-derives the
 * exact `effect(onCleanup => …)` shape KeepAwakeService.connect() uses, keyed off a local toggle
 * signal: flipping it on calls the service's connect() (mirroring the field-initializer call every
 * other screen makes), flipping it off runs onCleanup — deactivateKeepAwake() — before the effect
 * re-runs. Toggling on again re-engages via a fresh connect() call, which is harmless (the native
 * tag-based activation is idempotent, and any prior teardown effect deactivating a second time on
 * unmount is a no-op).
 */
@Component({
  selector: 'KeepAwakeScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaViewElement, ScrollViewElement, Text, View],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="keep-awake-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">{{ heroBadgeCode }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Keep Awake</text>
            <text class="hero-body">
              @symbiote-native/keep-awake — keeps the screen on for as long as a
              tagged activation stays engaged.
            </text>
          </view>
        </view>

        <view testID="keep-awake-capability-card" class="capability-card">
          <text class="capability-card-title">Capabilities</text>
          <view testID="keep-awake-is-available" class="capability-row">
            <text class="capability-label">isAvailableAsync()</text>
            <view [class]="statusBadgeClass(isAvailable())">
              <text class="status-badge-text">{{
                statusLabel(isAvailable())
              }}</text>
            </view>
          </view>
        </view>

        <view testID="keep-awake-toggle-card" class="capability-card">
          <text class="capability-card-title">Keep screen awake</text>
          <view testID="keep-awake-engaged" class="capability-row">
            <text class="capability-label">Engaged</text>
            <view [class]="statusBadgeClass(engagedStatus())">
              <text class="status-badge-text">{{
                statusLabel(engagedStatus())
              }}</text>
            </view>
          </view>
          <ActionButton
            testID="keep-awake-toggle-button"
            [title]="toggleTitle()"
            (press)="toggleKeepAwake()"
            [color]="lineColor"
          ></ActionButton>
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class KeepAwakeScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.KeepAwake];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  private readonly injector = inject(Injector);
  private readonly keepAwakeService = inject(KeepAwakeService);

  readonly isAvailable = signal<ICapabilityStatus>('checking');
  readonly isEngaged = signal(false);

  constructor() {
    isAvailableAsync().then(value =>
      this.isAvailable.set(toCapabilityStatus(value)),
    );

    effect(
      onCleanup => {
        if (!this.isEngaged()) {
          return;
        }
        this.keepAwakeService.connect(KEEP_AWAKE_DEMO_TAG);
        onCleanup(() => deactivateKeepAwake(KEEP_AWAKE_DEMO_TAG));
      },
      { injector: this.injector },
    );
  }

  toggleKeepAwake(): void {
    this.isEngaged.update(value => !value);
  }

  toggleTitle(): string {
    return this.isEngaged() ? 'Disengage' : 'Engage';
  }

  engagedStatus(): ICapabilityStatus {
    return this.isEngaged() ? 'yes' : 'no';
  }

  statusBadgeClass(status: ICapabilityStatus): string {
    return `status-badge status-badge-${status}`;
  }

  statusLabel(status: ICapabilityStatus): string {
    return status === 'checking'
      ? 'CHECKING…'
      : status === 'yes'
        ? 'YES'
        : 'NO';
  }
}
