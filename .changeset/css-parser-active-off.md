---
'@symbiote-native/css-parser': minor
---

`:active` is switched off, behind `IS_STATE_TOKEN_ENABLED`.

A functional `style={({pressed}) => …}` is specialised into a resting/active pair at build time
now, which reaches the same slot without pseudo-class machinery and is what the ecosystem already
writes — so the reason `:active` existed, keeping a pressable lowerable without a state-reading
callback, is gone. Keeping both live is what argues against it: they occupy different cascade
slots, so an adapter would have two ways to say one thing and a debugging session two places to
look.

An `:active` selector now warns with its own message naming the replacement, rather than the
shared "React Native cannot match this" sentence. The selector machinery is intact and one
constant turns it back on.
