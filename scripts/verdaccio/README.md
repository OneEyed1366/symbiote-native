# Local dev registry

A Verdaccio on `localhost:4873` that serves this working tree's build of `@symbiote-native/*` under
the ordinary public version an example's manifest already names. Optional: nothing in this repo
requires it, and a clone that ignores this directory behaves exactly as it always has.

```bash
pnpm run registry:setup                                  # once per machine
pnpm run registry:publish core/engine core/components    # after a change
pnpm run registry:on examples/react                      # point one example at it
pnpm run registry:refresh examples/react                 # pull the new bytes in
cd examples/react/ios && pod install                     # still owed, see below
```

`pnpm run registry:status` prints whether the registry is up and which examples point at it.
`pnpm run registry:off` returns everything to npmjs.

## Why this exists

The documented loop (`<examples_vs_dot_examples>` in the root CLAUDE.md) re-points an example's
manifest at a `.tarballs/*.tgz`. It works. It also writes machine-local install state into a
**tracked** file, and the only thing between that and a commit is somebody remembering — measured
2026-09-01, six manifests and five lockfiles were dirty with it at once.

Here the manifest is never touched. Only a gitignored `examples/<app>/.npmrc` says where the
version resolves from.

## The fallback, which decided the shape

**npm has no registry fallback chain.** A configured registry that is unreachable is a hard
failure, not a quiet fall-through to npmjs. So the pointer cannot be tracked: a committed
`registry=http://localhost:4873` would break `npm install` for every clone not running Verdaccio.

It is gitignored, a clone has none, and the manifest's public version literal resolves from npmjs.
That is the fallback and it is the default state. Opting in is `registry:on`; opting out is
`registry:off`, and neither touches a tracked file.

## What it does NOT fix

Measured, not assumed. npm's lockfile still short-circuits: publish new bytes under the **same**
version, run a plain `npm install`, and npm prints `up to date` and leaves the old copy in place —
the identical failure the tarball route has.

The difference is the repair. One explicit `npm install <pkg>@<version>` picks up the new bytes
(measured at 468 ms), where the tarball route needs the package folder **and** `package-lock.json`
deleted first and still missed on three of five examples once. `registry:refresh` is that explicit
install, derived from what each example's manifest actually declares.

And `pod install` is still owed afterwards, for the reason the root CLAUDE.md gives: replacing a
package folder deletes `@symbiote-native/splash-screen/.rn-bootsplash/`, which the podspec vendors
at pod-install time. Skip it and the next `xcodebuild` dies on a missing `RNBootSplash.mm`, buried
in clang argument dumps that read as a broken toolchain.

## Why not a real npm dist-tag

Tried on this project and reverted the same day — 2026-07-24, full record in the
`symbiote-release-publishing` skill. npm's `unpublish` and `deprecate` are OTP-gated even for a
token carrying an explicit 2FA bypass (that bypass only ever covers `publish`), so a snapshot can
never be removed and every iteration would be a permanent, public, immutable version.

Locally that particular blocker dissolves — you have the OTP — and the accumulation problem gets
worse, because perf work republishes many times a day. A registry you own has neither problem:
`unpublish: $all` in `config.yaml` is what lets the same version be replaced, and real npm will
never allow that.

## Notes

- `config.yaml` is tracked; `token` is not. The token is created on first `registry:setup` and
  exists to satisfy the npm CLI, which refuses to attempt a publish with no token configured for
  the host — the registry itself grants anonymous publish.
- Storage is a named docker volume (`verdaccio-storage`), not a bind mount into the repo:
  Verdaccio runs as uid 10001 and a host-owned directory it cannot write to fails at first publish,
  long after setup reported success.
- Anything not hosted here is proxied from npmjs and cached, so `react-native`, `expo-*` and the
  rest resolve normally. `@symbiote-native/*` is deliberately NOT proxied — a miss must be a miss,
  because a silent fall-through to the published version is the exact staleness this ends.
- On colima, the VM never returns host RAM once it has grown. A long-lived container holds it until
  `colima stop && colima start`.
- Loopback only, no auth. Do not expose this to another machine.
