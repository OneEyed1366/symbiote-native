import { Component, signal } from '@angular/core';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/angular';
import {
  hasAction,
  isAvailableAsync,
  requestReview,
} from '@symbiote-native/store-review/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

/**
 * @symbiote-native/store-review canary demo: two capability rows (isAvailableAsync()/hasAction(),
 * checked on init with no `IStoreReviewUrlOptions` supplied — this demo never opts into the
 * store-URL fallback) plus a request-review button. Every function is a plain re-export off the
 * core package — no service to inject(), same shape as @symbiote-native/crypto's plain-function
 * surface.
 */
@Component({
  selector: 'StoreReviewScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView
        testID="store-review-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">{{ heroBadgeCode }}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Store Review</Text>
            <Text class="hero-body">
              @symbiote-native/store-review — the native App Store/Play Store
              review prompt, letting a user rate the app without leaving it.
            </Text>
          </View>
        </View>

        <View testID="store-review-capability-card" class="capability-card">
          <Text class="capability-card-title">Capabilities</Text>
          <View testID="store-review-is-available" class="capability-row">
            <Text class="capability-label">isAvailableAsync()</Text>
            <View [class]="statusBadgeClass(isAvailable())">
              <Text class="status-badge-text">{{
                statusLabel(isAvailable())
              }}</Text>
            </View>
          </View>
          <View testID="store-review-has-action" class="capability-row">
            <Text class="capability-label">hasAction()</Text>
            <View [class]="statusBadgeClass(hasReviewAction())">
              <Text class="status-badge-text">{{
                statusLabel(hasReviewAction())
              }}</Text>
            </View>
          </View>
        </View>

        <View testID="store-review-request-card" class="capability-card">
          <Text class="capability-card-title">Request review</Text>
          <ActionButton
            testID="store-review-request-button"
            title="Request Review"
            (press)="handleRequestReview()"
            [color]="lineColor"
          ></ActionButton>
          <Text testID="store-review-request-result" class="value-text">{{
            lastResult()
          }}</Text>
          <Text class="info-text">
            resolved means the call completed, not that a prompt appeared. On
            Android the Play dialog only shows for a build installed from Google
            Play (internal test track, internal app sharing, or production); a
            sideloaded debug build resolves silently. iOS shows it in debug
            builds. Both stores also enforce a quota.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  `,
})
export class StoreReviewScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StoreReview];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly isAvailable = signal<ICapabilityStatus>('checking');
  readonly hasReviewAction = signal<ICapabilityStatus>('checking');
  readonly lastResult = signal('idle');

  constructor() {
    isAvailableAsync().then(value =>
      this.isAvailable.set(toCapabilityStatus(value)),
    );
    hasAction().then(value =>
      this.hasReviewAction.set(toCapabilityStatus(value)),
    );
  }

  // Neither store reports whether a prompt appeared — a suppressed dialog and a rejected call
  // look identical unless the outcome is shown.
  handleRequestReview(): void {
    this.lastResult.set('requesting…');
    requestReview()
      .then(() => this.lastResult.set('resolved'))
      .catch((error: Error) =>
        this.lastResult.set(`rejected: ${error.message}`),
      );
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
