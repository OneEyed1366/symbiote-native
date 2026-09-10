import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import {} from '@symbiote-native/vue';
import {
  hasAction,
  isAvailableAsync,
  requestReview,
} from '@symbiote-native/store-review/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <text class="auth-value-text">{props.value}</text>
    </view>
  );
}

/**
 * Store Review demo: @symbiote-native/store-review — no store URL is passed to requestReview()/
 * hasAction() here (this project has no expo-constants manifest to read one from, see the
 * package's own core/store-review.ts comment), so `hasAction()` reflects only the native flow's
 * own availability. Plain re-export, same for every adapter.
 */
export const StoreReviewScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StoreReview];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.StoreReview].line];

    const isAvailable: Ref<boolean | null> = ref(null);
    const canTakeAction: Ref<boolean | null> = ref(null);
    const lastResult: Ref<string> = ref('idle');

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    onMounted(() => {
      isAvailableAsync().then(value => {
        if (isMounted) isAvailable.value = value;
      });
      hasAction().then(value => {
        if (isMounted) canTakeAction.value = value;
      });
    });

    // Neither store reports whether a prompt appeared — a suppressed dialog and a rejected call
    // look identical unless the outcome is shown.
    function handleRequestReview() {
      lastResult.value = 'requesting…';
      requestReview()
        .then(() => {
          lastResult.value = 'resolved';
        })
        .catch((error: Error) => {
          lastResult.value = `rejected: ${error.message}`;
        });
    }

    return () => (
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
                @symbiote-native/store-review — the native in-app App Store/Play
                Store review prompt, with a store-URL fallback the caller
                supplies explicitly.
              </text>
            </view>
          </view>

          <view testID="store-review-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Capabilities</text>
            </view>
            <ValueRow
              label="isAvailableAsync"
              value={
                isAvailable.value === null
                  ? 'checking…'
                  : isAvailable.value
                    ? 'true'
                    : 'false'
              }
            />
            <ValueRow
              label="hasAction"
              value={
                canTakeAction.value === null
                  ? 'checking…'
                  : canTakeAction.value
                    ? 'true'
                    : 'false'
              }
            />
            <ActionButton
              testID="store-review-request-button"
              title="Request Review"
              onPress={handleRequestReview}
              color={lineColor}
            />
            <ValueRow label="Last result" value={lastResult.value} />
            <text class="info-text">
              resolved means the call completed, not that a prompt appeared. On
              Android the Play dialog only shows for a build installed from
              Google Play (internal test track, internal app sharing, or
              production); a sideloaded debug build resolves silently. iOS shows
              it in debug builds. Both stores also enforce a quota.
            </text>
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'StoreReviewScreen' },
);
