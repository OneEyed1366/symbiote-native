import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import { hasAction, isAvailableAsync, requestReview } from '@symbiote-native/store-review/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <View class="auth-capability-row">
      <Text class="auth-capability-label">{props.label}</Text>
      <Text class="auth-value-text">{props.value}</Text>
    </View>
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

    function handleRequestReview() {
      requestReview();
    }

    return () => (
      <SafeAreaView class="screen">
        <ScrollView testID="store-review-scroll" class="screen" contentContainerStyle="scroll-content">
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
                @symbiote-native/store-review — the native in-app App Store/Play Store review
                prompt, with a store-URL fallback the caller supplies explicitly.
              </Text>
            </View>
          </View>

          <View testID="store-review-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Capabilities</Text>
            </View>
            <ValueRow
              label="isAvailableAsync"
              value={isAvailable.value === null ? 'checking…' : isAvailable.value ? 'true' : 'false'}
            />
            <ValueRow
              label="hasAction"
              value={canTakeAction.value === null ? 'checking…' : canTakeAction.value ? 'true' : 'false'}
            />
            <ActionButton
              testID="store-review-request-button"
              title="Request Review"
              onPress={handleRequestReview}
              color={lineColor}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'StoreReviewScreen' },
);
