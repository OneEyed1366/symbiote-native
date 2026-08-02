<!--
  @symbiote-native/keep-awake tour stop — useKeepAwake() has no on/off switch of its own, it
  activates on mount and deactivates on unmount, so a toggle mounting/unmounting a tiny child
  component (KeepAwakeHolder, defined below) is what actually acquires/releases the lock. Vue SFC
  twin of ../../react/screens/KeepAwakeScreen.tsx and the Vue-TSX twin
  ../../expo-vue-tsx/screens/KeepAwakeScreen.tsx (same defineComponent-holder shape, ported to SFC).
-->
<script setup lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import { isAvailableAsync, useKeepAwake } from '@symbiote-native/keep-awake/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

// Holds the keep-awake lock only while mounted — useKeepAwake() activates in onMounted and
// deactivates in onUnmounted internally, so mounting/unmounting THIS component (via v-if below)
// is what actually acquires/releases the lock.
const KeepAwakeHolder = defineComponent(() => {
  useKeepAwake();
  return () => null;
});

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.KeepAwake];
const lineColor = LINE_COLOR[lineInfo.line];

const isHeld = ref<boolean>(false);
const isAvailable = ref<ICapabilityStatus>('checking');

onMounted(() => {
  void isAvailableAsync().then(value => {
    isAvailable.value = toCapabilityStatus(value);
  });
});

function handleToggle(): void {
  isHeld.value = !isHeld.value;
}
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView testID="keep-awake-scroll" class="screen" content-container-style="scroll-content">
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: lineColor }">
          <Text class="hero-badge-text">{{ lineInfo.code }}</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Keep Awake</Text>
          <Text class="hero-body"
            >@symbiote-native/keep-awake — keeps the screen on for as long as a component holding
            useKeepAwake() stays mounted.</Text
          >
        </View>
      </View>

      <View testID="keep-awake-card" class="keep-awake-card">
        <Text class="keep-awake-card-title">Screen lock</Text>
        <View class="keep-awake-row">
          <Text class="keep-awake-row-label">Available</Text>
          <View :class="`keep-awake-status-badge keep-awake-status-badge-${isAvailable}`">
            <Text class="keep-awake-status-text">{{
              isAvailable === 'checking' ? 'CHECKING…' : isAvailable === 'yes' ? 'YES' : 'NO'
            }}</Text>
          </View>
        </View>
        <View class="keep-awake-row">
          <Text class="keep-awake-row-label">Held</Text>
          <Text testID="keep-awake-held-value" class="keep-awake-value-text">{{
            isHeld ? 'true' : 'false'
          }}</Text>
        </View>
        <ActionButton
          testID="keep-awake-toggle-button"
          :title="isHeld ? 'Release keep-awake' : 'Activate keep-awake'"
          :onPress="handleToggle"
          :color="lineColor"
        />
        <KeepAwakeHolder v-if="isHeld" />
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
