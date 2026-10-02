---
'@symbiote-native/components': patch
---

The press machine builds its gesture runtime on the first event instead of at mount, so a pressable
nobody touches pays for its dispatchers and nothing else. Every tag carrying the machine drops
~1 KB per node: `button` 8 259 -> 7 259 KB / 1 000, `touchable-opacity` 7 992 -> 6 992,
`pressable` 3 561 -> 2 559, `text-input` 6 090 -> 5 168.
