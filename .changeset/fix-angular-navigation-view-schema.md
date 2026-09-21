---
"@symbiote-native/navigation": patch
---

Fix Angular AOT build failure in `Tab`/`Drawer`: raw `<view>` tags need `NO_ERRORS_SCHEMA`, not `CUSTOM_ELEMENTS_SCHEMA` (which only relaxes dashed tag names).
