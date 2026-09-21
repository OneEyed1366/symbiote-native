---
"@symbiote-native/cli": patch
---

Fix `add` silently re-applying an already-added layer when its flag is passed explicitly alongside genuinely missing ones (e.g. `add --navigation --slider` on an app that already has navigation), overwriting App/MenuScreen/DetailsScreen and wiping out developer customization. An already-added layer is now dropped from an explicit flag list unless `--force` is passed to intentionally reset it back to the template defaults.
