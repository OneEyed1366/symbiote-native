import { createSignal, onCleanup } from 'solid-js';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/solid';
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
    <View class="capability-row">
      <Text class="capability-label">{props.label}</Text>
      <Text class="value-text">{props.value}</Text>
    </View>
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
    <SafeAreaView class="screen">
      <ScrollView
        testID="store-review-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text class="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Store Review</Text>
            <Text class="hero-body">
              @symbiote-native/store-review — prompts the platform's native
              in-app review flow.
            </Text>
          </View>
        </View>

        <View testID="store-review-capability-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Capability</Text>
          </View>
          <ValueRow
            label="Native flow available"
            value={
              isAvailable() === null ? 'checking…' : isAvailable() ? 'Yes' : 'No'
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
        </View>

        <View testID="store-review-action-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Request review</Text>
          </View>
          <ActionButton
            testID="store-review-request-button"
            title="Request Review"
            onPress={handleRequestReview}
            color={lineColor}
          />
          <View class="capability-row">
            <Text class="capability-label">Last result</Text>
            <Text testID="store-review-result" class="value-text">
              {lastResult()}
            </Text>
          </View>
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
  );
}
