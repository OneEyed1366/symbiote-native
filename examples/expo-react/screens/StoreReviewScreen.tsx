import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/react';
import { hasAction, isAvailableAsync, requestReview } from '@symbiote-native/store-review';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="capability-row">
      <Text className="capability-label">{label}</Text>
      <Text className="value-text">{value}</Text>
    </View>
  );
}

/**
 * @symbiote-native/store-review canary demo: capability card (isAvailableAsync/hasAction,
 * resolved on mount, no store-URL options supplied) plus a button firing requestReview() — on
 * the simulator this most likely hits the native review flow or warns to the console, both
 * expected outcomes for demo purposes.
 */
export function StoreReviewScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StoreReview];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [canRequestReview, setCanRequestReview] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([isAvailableAsync(), hasAction()]).then(([available, action]) => {
      if (isMounted) {
        setIsAvailable(available);
        setCanRequestReview(action);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <SafeAreaView className="screen">
      <ScrollView testID="store-review-scroll" className="screen" contentContainerStyle="scroll-content">
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Store Review</Text>
            <Text className="hero-body">
              @symbiote-native/store-review — prompts the platform's native in-app review flow.
            </Text>
          </View>
        </View>

        <View testID="store-review-capability-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Capability</Text>
          </View>
          <ValueRow
            label="Native flow available"
            value={isAvailable === null ? 'checking…' : isAvailable ? 'Yes' : 'No'}
          />
          <ValueRow
            label="Can request review"
            value={canRequestReview === null ? 'checking…' : canRequestReview ? 'Yes' : 'No'}
          />
        </View>

        <View testID="store-review-action-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Request review</Text>
          </View>
          <ActionButton
            testID="store-review-request-button"
            title="Request Review"
            onPress={() => requestReview()}
            color={lineColor}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
