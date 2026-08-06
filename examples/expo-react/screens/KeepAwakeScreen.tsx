import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Switch, Text, View } from '@symbiote-native/react';
import { isAvailableAsync, useKeepAwake } from '@symbiote-native/keep-awake/react';
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

// useKeepAwake() has no on/off param — it activates for as long as the calling component is
// mounted and deactivates on unmount. Mounting/unmounting THIS child is what turns the lock on
// and off, mirroring upstream's own "call the hook only while you want the screen awake" idiom.
function KeepAwakeHolder() {
  useKeepAwake();
  return null;
}

/**
 * @symbiote-native/keep-awake canary demo: a toggle whose "on" state mounts KeepAwakeHolder,
 * activating the keep-awake lock; toggling off unmounts it, deactivating the lock. Plus a
 * capability row for isAvailableAsync().
 */
export function KeepAwakeScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.KeepAwake];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [isKeepAwakeOn, setIsKeepAwakeOn] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    isAvailableAsync().then(setIsAvailable);
  }, []);

  return (
    <SafeAreaView className="screen">
      <ScrollView testID="keep-awake-scroll" className="screen" contentContainerStyle="scroll-content">
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Keep Awake</Text>
            <Text className="hero-body">
              @symbiote-native/keep-awake — keeps the screen on for the lifetime of a mounted
              component.
            </Text>
          </View>
        </View>

        <View testID="keep-awake-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Keep screen awake</Text>
          </View>
          <ValueRow label="Available" value={isAvailable === null ? 'checking…' : isAvailable ? 'Yes' : 'No'} />
          <View testID="keep-awake-toggle-row" className="capability-row">
            <Text className="capability-label">Keep screen awake</Text>
            <Switch
              testID="keep-awake-switch"
              value={isKeepAwakeOn}
              onValueChange={setIsKeepAwakeOn}
              trackColor={{ true: lineColor }}
            />
          </View>
          {isKeepAwakeOn && <KeepAwakeHolder />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
