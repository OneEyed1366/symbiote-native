import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import { isAvailableAsync, useKeepAwake } from '@symbiote-native/keep-awake/vue';
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

// Holds the keep-awake lock only while mounted — useKeepAwake() activates in onMounted and
// deactivates in onUnmounted, so toggling the parent's `isHeld` ref in/out of the tree is what
// actually acquires/releases the lock (the composable itself has no on/off switch of its own).
const KeepAwakeHolder = defineComponent(
  () => {
    useKeepAwake();
    return () => null;
  },
  { name: 'KeepAwakeHolder' },
);

/**
 * Keep Awake demo: @symbiote-native/keep-awake/vue's useKeepAwake composable — a toggle mounts/
 * unmounts KeepAwakeHolder, which is the only thing actually holding the lock.
 */
export const KeepAwakeScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.KeepAwake];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.KeepAwake].line];

    const isHeld: Ref<boolean> = ref(false);
    const isAvailable: Ref<boolean | null> = ref(null);

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    onMounted(() => {
      isAvailableAsync().then(value => {
        if (isMounted) isAvailable.value = value;
      });
    });

    function handleToggle() {
      isHeld.value = !isHeld.value;
    }

    return () => (
      <SafeAreaView class="screen">
        <ScrollView testID="keep-awake-scroll" class="screen" contentContainerStyle="scroll-content">
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: lineColor }}>
              <Text class="hero-badge-text">{lineInfo.code}</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Keep Awake</Text>
              <Text class="hero-body">
                @symbiote-native/keep-awake — keeps the screen on for as long as a component
                holding useKeepAwake() stays mounted.
              </Text>
            </View>
          </View>

          <View testID="keep-awake-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Screen lock</Text>
            </View>
            <ValueRow
              label="isAvailableAsync"
              value={isAvailable.value === null ? 'checking…' : isAvailable.value ? 'true' : 'false'}
            />
            <ValueRow label="Held" value={isHeld.value ? 'true' : 'false'} />
            <ActionButton
              testID="keep-awake-toggle-button"
              title={isHeld.value ? 'Release keep-awake' : 'Activate keep-awake'}
              onPress={handleToggle}
              color={lineColor}
            />
            {isHeld.value ? <KeepAwakeHolder /> : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'KeepAwakeScreen' },
);
