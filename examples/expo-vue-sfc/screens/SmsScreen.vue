<!--
  @symbiote-native/sms tour stop — an isAvailableAsync capability row plus a composer card that
  opens the system SMS composer prefilled with the recipients and message typed below. Vue SFC twin
  of ../../expo-react/screens/SmsScreen.tsx.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from '@symbiote-native/vue';
import { isAvailableAsync, sendSMSAsync } from '@symbiote-native/sms/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function toBadgeText(status: ICapabilityStatus): string {
  return status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sms];
const lineColor = LINE_COLOR[lineInfo.line];

const isAvailable = ref<ICapabilityStatus>('checking');
const recipients = ref('0123456789');
const message = ref('Running late, sorry!');
const lastResult = ref('idle');

onMounted(() => {
  void isAvailableAsync().then(available => {
    isAvailable.value = toCapabilityStatus(available);
  });
});

function handleSend(): void {
  lastResult.value = 'opening composer…';
  const addresses = recipients.value
    .split(',')
    .map(address => address.trim())
    .filter(address => address.length > 0);

  void sendSMSAsync(addresses, message.value)
    .then(response => {
      lastResult.value = `result: ${response.result}`;
    })
    .catch((error: Error) => {
      lastResult.value = `send failed: ${error.message}`;
    });
}
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView
      testID="sms-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: lineColor }">
          <Text class="hero-badge-text">{{ lineInfo.code }}</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">SMS</Text>
          <Text class="hero-body"
            >@symbiote-native/sms — opens the system SMS composer prefilled with
            recipients and a message. The user still has to press send
            themselves.</Text
          >
        </View>
      </View>

      <View testID="sms-capability-card" class="sms-card">
        <Text class="sms-card-title">Capabilities</Text>
        <View testID="sms-available" class="sms-row">
          <Text class="sms-row-label">Available</Text>
          <View :class="`sms-status-badge sms-status-badge-${isAvailable}`">
            <Text class="sms-status-text">{{ toBadgeText(isAvailable) }}</Text>
          </View>
        </View>
        <Text class="sms-note"
          >NO on the iOS simulator, which ships no Messages app, and on Android
          devices without telephony hardware. A real iPhone or an Android device
          with a SIM reports YES.</Text
        >
      </View>

      <View testID="sms-compose-card" class="sms-card">
        <Text class="sms-card-title">Compose</Text>
        <TextInput
          testID="sms-recipients-input"
          v-model="recipients"
          placeholder="Recipients, comma-separated"
          placeholder-text-color="#41506a"
          class="text-input"
          auto-capitalize="none"
          :auto-correct="false"
        />
        <TextInput
          testID="sms-message-input"
          v-model="message"
          placeholder="Message"
          placeholder-text-color="#41506a"
          class="text-input"
        />
        <ActionButton
          testID="sms-send-button"
          title="Open composer"
          :onPress="handleSend"
          :color="lineColor"
        />
        <View class="sms-row">
          <Text class="sms-row-label">Last result</Text>
          <Text testID="sms-result" class="sms-value-text">{{
            lastResult
          }}</Text>
        </View>
        <Text class="sms-note"
          >iOS reports sent or cancelled; Android always reports unknown,
          because reading the real outcome needs the READ_SMS permission Google
          restricts to default-SMS-app publishers. Treat unknown as "the
          composer closed".</Text
        >
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
