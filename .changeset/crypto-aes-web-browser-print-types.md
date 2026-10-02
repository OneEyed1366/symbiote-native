---
'@symbiote-native/crypto': patch
'@symbiote-native/web-browser': patch
'@symbiote-native/print': patch
'@symbiote-native/audio': patch
'@symbiote-native/contacts': patch
---

`crypto` gains the AES-GCM API (`AESEncryptionKey`, `AESSealedData`, `aesEncryptAsync`, `aesDecryptAsync`). `web-browser` gains `maybeCompleteAuthSession`. `print` accepts the deprecated `markupFormatterIOS` option. `audio` exports `IAudioLoadOptions` and `contacts` exports `ContactFieldKey`, both from upstream.
