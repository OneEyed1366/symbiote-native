import { createSignal, onCleanup } from 'solid-js';
import {
  hasAction,
  isAvailableAsync,
  requestReview,
} from '@symbiote-native/store-review';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <text class="value-text">{props.value}</text>
    </view>
  );
}

/**
 * @symbiote-native/store-review canary demo: capability card (isAvailableAsync/hasAction,
 * resolved on mount, no store-URL options supplied) plus a button firing requestReview().
 *
 * Neither store reports whether a dialog appeared, so without the result row a suppressed
 * prompt and a rejected call are the same blank screen.
 */
export function StoreReviewScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StoreReview];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [isAvailable, setIsAvailable] = createSignal<boolean | null>(null);
  const [canRequestReview, setCanRequestReview] = createSignal<boolean | null>(
    null,
  );
  const [lastResult, setLastResult] = createSignal('idle');

  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  Promise.all([isAvailableAsync(), hasAction()]).then(([available, action]) => {
    if (!disposed) {
      setIsAvailable(available);
      setCanRequestReview(action);
    }
  });

  const handleRequestReview = () => {
    setLastResult('requesting…');
    requestReview()
      .then(() => setLastResult('resolved'))
      .catch((error: Error) => setLastResult(`rejected: ${error.message}`));
  };

  return (
    <safe-area-view class="screen">
      <scroll-view
        testID="store-review-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view class={`line-tag line-tag-${lineInfo.line}`}>
          <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" style={{ backgroundColor: lineColor }}>
            <text class="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Store Review</text>
            <text class="hero-body">
              @symbiote-native/store-review — prompts the platform's native
              in-app review flow.
            </text>
          </view>
        </view>

        <view testID="store-review-capability-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Capability</text>
          </view>
          <ValueRow
            label="Native flow available"
            value={
              isAvailable() === null
                ? 'checking…'
                : isAvailable()
                  ? 'Yes'
                  : 'No'
            }
          />
          <ValueRow
            label="Can request review"
            value={
              canRequestReview() === null
                ? 'checking…'
                : canRequestReview()
                  ? 'Yes'
                  : 'No'
            }
          />
        </view>

        <view testID="store-review-action-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Request review</text>
          </view>
          <ActionButton
            testID="store-review-request-button"
            title="Request Review"
            onPress={handleRequestReview}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Last result</text>
            <text testID="store-review-result" class="value-text">
              {lastResult()}
            </text>
          </view>
          <text class="info-text">
            resolved means the call completed, not that a prompt appeared. On
            Android the Play dialog only shows for a build installed from Google
            Play (internal test track, internal app sharing, or production); a
            sideloaded debug build resolves silently. iOS shows it in debug
            builds. Both stores also enforce a quota.
          </text>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
