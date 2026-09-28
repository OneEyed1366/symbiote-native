---
'@symbiote-native/engine': patch
'@symbiote-native/components': patch
---

A host behavior answers its events through one shared dispatch instead of installing a closure per
name, and TouchableOpacity builds its fade runtime on the first press rather than at attach. Per
thousand items: pressable 2 559 -> 1 263 KB, touchable-opacity 6 992 -> 3 584, button 7 259 ->
4 068, text-input 5 167 -> 3 824.
