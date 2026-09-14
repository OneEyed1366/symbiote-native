---
'@symbiote-native/engine': patch
---

`afterCommit` now drains on every commit path, and host behaviors are swept when a surface goes
away.

The targeted commit path (a single node's props recomputed outside a full tree walk) skipped the
`afterCommit` queue entirely, so a behavior relying on it to run post-commit work saw it fire only
after a full commit. A no-op commit — nothing actually changed, `completeRoot` never called — left
the same queue undrained rather than cleared, and a surface torn down mid-flight leaked whatever
host behaviors it had attached instead of sweeping them. See
`.claude/rules/unmount-does-not-sweep-host-behaviors.md` for the failure this closes.
