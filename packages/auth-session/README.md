# @symbiote-native/auth-session

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-auth-session`](https://github.com/expo/expo/tree/main/packages/expo-auth-session) - a
PKCE-based OAuth2/OpenID Connect flow over a browser tab - usable from **every** adapter, React,
Vue, Svelte, Solid, and Angular, not just React.

Unlike every other package in this catalog, `expo-auth-session` ships **no native code at all** -
it is a pure-JS flow built entirely on other Expo JS APIs. So instead of wrapping
`expo-auth-session` directly, this package hand-ports its logic and depends on the packages that
already cover its building blocks: [`@symbiote-native/web-browser`](../web-browser) (the
authorization tab), [`@symbiote-native/crypto`](../crypto) (PKCE), and
[`@symbiote-native/application`](../application) (the default native redirect scheme). No
`expo-modules-core` dependency, no `native-link.json` - same shape as
[`@symbiote-native/standard-web-crypto`](../standard-web-crypto).

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --auth-session
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --auth-session
```

Either way: installs `@symbiote-native/auth-session`, which pulls in
`@symbiote-native/web-browser`/`@symbiote-native/crypto`/`@symbiote-native/application` as regular
dependencies. If those three aren't already installed as standalone packages in your app, their
own native autolinking wiring still applies - see
[`@symbiote-native/web-browser`'s README](../web-browser/README.md) for the one-time app steps.

<details>
<summary>Manual install (no CLI)</summary>

```bash
npm install @symbiote-native/auth-session
```

</details>

## What's not ported

- **The Expo Go / `auth.expo.io` proxy flow** (`SessionUrlProvider`, the legacy
  `AuthSession.getRedirectUrl`/`getDefaultReturnUrl`) - built entirely on `expo-constants`'
  app-manifest concept (`Constants.expoConfig`, `ExecutionEnvironment`), which doesn't exist in
  this bare, Metro-only, non-Expo-CLI project (`expo-constants` is deliberately unported - see the
  `symbiote-expo-package-catalog` skill).
- **`makeRedirectUri`'s manifest-scheme auto-detection.** Upstream's version calls
  `expo-linking`'s `createURL`/`resolveScheme`, which read a scheme out of the same app manifest.
  This port's `makeRedirectUri` never reads a manifest: pass `native` for a production build, or
  `scheme` otherwise - it throws if neither is given, rather than guessing.
- **`useAuthRequest`/`useIdTokenAuthRequest`/`useAutoDiscovery`** (both the base hooks and each
  provider's) - real React hooks (`useState`/`useEffect`/`useMemo`). Use `AuthRequest` (or
  `GoogleAuthRequest`/`FacebookAuthRequest`) and `resolveDiscoveryAsync`/`loadAsync` directly
  instead; an adapter-specific hook can wrap them the way other packages' adapters do.
- **Upstream's `Request<T, B>` base class is renamed `TokenRequest`'s internal `BaseRequest`** to
  avoid shadowing the global `Request` type used by `fetch`.

## Not ported (test scope)

Upstream ships tests for `AuthRequest`, `Base64`, `Errors`, `QueryParams`, and `TokenRequest` - all
five are ported (`src/core/*.test.ts`). `AuthSession-test.*.ts` and `SessionUrlProvider-test.ts`
are **not** ported: both test only the dropped manifest/proxy flow above. `auth-session.test.ts`
here instead covers this port's own trimmed `makeRedirectUri` contract.

## Shape

```
src/core/         AuthRequest, TokenRequest family, Discovery, Errors, PKCE, Base64, QueryParams,
                  Fetch, AuthSession (dismiss/makeRedirectUri/loadAsync), providers/{google,facebook}
src/angular/      @symbiote-native/auth-session/angular
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto `src/core/`.

## Use it

```ts
import { AuthRequest, exchangeCodeAsync, makeRedirectUri } from '@symbiote-native/auth-session';

const discovery = {
  authorizationEndpoint: 'https://example.com/oauth/authorize',
  tokenEndpoint: 'https://example.com/oauth/token',
};

const request = new AuthRequest({
  clientId: 'my-client-id',
  redirectUri: makeRedirectUri({ scheme: 'myapp' }),
  scopes: ['openid', 'profile'],
});

const result = await request.promptAsync(discovery);
if (result.type === 'success') {
  const token = await exchangeCodeAsync(
    { clientId: 'my-client-id', code: result.params.code, redirectUri: request.redirectUri },
    discovery,
  );
}
```

## Test it

```bash
pnpm vitest run packages/auth-session
```
