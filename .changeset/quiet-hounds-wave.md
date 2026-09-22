---
'@symbiote-native/engine': minor
---

Apply React Native's own `<Text>` and `<TextInput>` accessibility defaults. A text node now commits `accessible: true` and `overflow: 'hidden'`, and a text input commits `accessible: true`, matching `Text.js` and `TextInput.js` - each a fallback an authored value still beats. Text was previously announced differently by VoiceOver and did not clip.
