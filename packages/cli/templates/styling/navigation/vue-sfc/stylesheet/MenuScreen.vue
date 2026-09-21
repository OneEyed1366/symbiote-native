<script setup>
import { ref } from 'vue';
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import { StyleSheet } from '@symbiote-native/vue';

const count = ref(0);
const navigation = useStackNavigation();
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b1622',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 24,
    paddingHorizontal: 32,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  brandLogo: { height: 64 },
  brandLogoReact: { aspectRatio: 1.0977 },
  brandLogoVue: { aspectRatio: 1.1542 },
  plusIcon: { width: 48, height: 48 },
  title: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { color: '#cbd5e1', fontSize: 14, textAlign: 'center' },
  counterCard: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 20,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: '#13243a',
  },
  counterLabel: { color: '#41506a', fontSize: 12, letterSpacing: 1 },
  counterValue: { color: '#42b883', fontSize: 32, fontWeight: 'bold' },
  buttonRow: { flexDirection: 'row', gap: 12 },
  buttonPrimary: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 22,
    backgroundColor: '#42b883',
  },
  buttonSecondary: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderWidth: 1.5,
    borderColor: '#41506a',
  },
  buttonPrimaryText: { color: '#0b1622', fontSize: 15, fontWeight: 'bold' },
  buttonSecondaryText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
});
</script>

<template>
  <safe-area-view :style="styles.screen">
    <view :style="styles.brandRow">
      <image
        :style="[styles.brandLogo, styles.brandLogoReact]"
        resize-mode="contain"
        :source="require('./assets/react-native-logo.png')"
      />
      <image :style="styles.plusIcon" resize-mode="contain" :source="require('./assets/plus-icon.png')" />
      <image
        :style="[styles.brandLogo, styles.brandLogoVue]"
        resize-mode="contain"
        :source="require('./assets/vue-logo.png')"
      />
    </view>

    <text :style="styles.title">Welcome to SymbioteNative!</text>
    <text :style="styles.subtitle">Framework-agnostic React Native, driven by Vue.</text>

    <view :style="styles.counterCard">
      <text :style="styles.counterLabel">TAPS</text>
      <text :style="styles.counterValue">{{ count }}</text>
    </view>

    <view :style="styles.buttonRow">
      <pressable :style="styles.buttonPrimary" @press="count++">
        <text :style="styles.buttonPrimaryText">Tap me</text>
      </pressable>
      <pressable :style="styles.buttonSecondary" @press="() => navigation.push('Details')">
        <text :style="styles.buttonSecondaryText">Go to Details</text>
      </pressable>
    </view>
  </safe-area-view>
</template>
