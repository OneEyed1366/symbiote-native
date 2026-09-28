---
'@symbiote-native/components': patch
---

TouchableOpacity and Button bind their animated opacity layer on the first press instead of at
mount. Mounting a thousand touchables drops from 65 ms / 25 MB to 27 ms / 8 MB, a button from
74 ms / 26 MB to 43 ms / 8 MB. An untouched touchable now commits no `opacity` key, matching
vendor (`TouchableOpacity-itest.js`); `collapsable: false` is still forced from mount.
