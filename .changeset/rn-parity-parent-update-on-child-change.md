---
'@symbiote-native/engine': patch
---

A parent whose only change is its child list no longer reaches the platform as an `Update`. The commit handed Fabric an empty props object, which re-parsed the props and swapped the props pointer, so every insert or remove under a view also updated the view itself.
