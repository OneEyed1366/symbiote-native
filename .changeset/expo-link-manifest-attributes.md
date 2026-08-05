---
"@symbiote-native/expo-modules-link": minor
---

Set attributes on the app's `<application>` element from a wrapper package's manifest. A package
declares them under `android.manifestApplicationAttributes` in its `native-link.json`:

```json
{
  "android": {
    "manifestApplicationAttributes": {
      "android:fullBackupContent": "@xml/secure_store_backup_rules",
      "android:dataExtractionRules": "@xml/secure_store_data_extraction_rules"
    }
  }
}
```

`@symbiote-native/secure-store` is the first package that needs this: without those two
attributes, Android Auto Backup uploads the encrypted SecureStore entries but not the Keystore
keys that decrypt them, so a restore onto a new device leaves the app holding values it can no
longer read.

Like the iOS `Info.plist` keys and unlike the two Android regions, this is additive-only - an
attribute is unique per element by construction, so its presence is a sufficient idempotency
check, and no XML comment can live inside a tag to delimit a region anyway. An attribute the app
already sets is kept and reported, never overwritten: backup rules decide what leaves the device,
so the app's own value wins.
