---
'@symbiote-native/engine': patch
---

An `Image` whose `source` carries a `width` and `height` takes them as its default size, ahead of the `width` and `height` props, as `source.width ?? props.width` does in RN. Before, `source={{ uri, width: 64, height: 64 }}` without a style committed no size and laid out as 0 by 0.
