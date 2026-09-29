---
'@symbiote-native/components': patch
---

TouchableWithoutFeedback builds its press-timing runtime on the first gesture instead of when it
adopts a child, so a list of them nobody touches stops paying for it: 383 bytes per item,
7 183 -> 6 800 KB per thousand.
