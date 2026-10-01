# @symbiote-native/auth-session

Add "Sign in with ..." through your identity provider's web page: the app opens a browser tab, the
user signs in, the provider redirects back with a code, and you exchange it for a token. One API
for every [SymbioteNative](../../README.md) adapter (React, Vue, Svelte, Solid and Angular).

It ports [`expo-auth-session`](https://github.com/expo/expo/tree/main/packages/expo-auth-session),
a PKCE-based OAuth2/OpenID Connect flow over a browser tab, with its hooks in each framework's own
idiom.

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

### Register a URL scheme for the redirect

The provider redirects back through a custom URL scheme (for example `myapp://`), so the app has to
own one: register it in your iOS and Android projects and rebuild. Without a scheme the sign-in
still completes, but the result cannot reach your app and the user has to close the browser tab by
hand, which reads as a cancelled event. Allow-list the same redirect URI at your provider.

## Notes

- **Never put secret keys in app code.** A client secret in a mobile app is not secret; keep it on
  your server. PKCE exists so a public client needs none.
- **Filter auth redirects out of your own link handlers.** An auth redirect is one more deep link;
  put a recognizable marker in your own `redirectUri` so your `Linking` handler or router can
  ignore it.

## What's not ported

- **The Expo Go / `auth.expo.io` proxy flow** (`SessionUrlProvider`, the legacy
  `AuthSession.getRedirectUrl`/`getDefaultReturnUrl`) - built entirely on `expo-constants`'
  app-manifest concept (`Constants.expoConfig`, `ExecutionEnvironment`), which doesn't exist in
  this bare, Metro-only, non-Expo-CLI project. `@symbiote-native/constants` ports only the native
  fields of `expo-constants` and never the manifest, so it does not bring this flow back.
- **`makeRedirectUri`'s manifest-scheme auto-detection.** Upstream's version calls
  `expo-linking`'s `createURL`/`resolveScheme`, which read a scheme out of the same app manifest.
  This port's `makeRedirectUri` never reads a manifest: pass `native` for a production build, or
  `scheme` otherwise - it throws if neither is given, rather than guessing.
- **Upstream's `Request<T, B>` base class is renamed `TokenRequest`'s internal `BaseRequest`** to
  avoid shadowing the global `Request` type used by `fetch`.

## Not ported (test scope)

Upstream ships tests for `AuthRequest`, `Base64`, `Errors`, `QueryParams`, and `TokenRequest` - all
five are ported (`src/core/*.test.ts`). `AuthSession-test.*.ts` and `SessionUrlProvider-test.ts`
are **not** ported: both test only the dropped manifest/proxy flow above. `auth-session.test.ts`
here instead covers this port's own trimmed `makeRedirectUri` contract.

## Hooks

Every hook upstream ships is ported to every adapter, the load, prompt and code-exchange logic is
shared in `core/` and each adapter supplies only its lifecycle:

| Upstream | React | Vue / Solid / Svelte | Angular |
|---|---|---|---|
| `useAutoDiscovery` | `useAutoDiscovery(issuer)` | same name, getter or ref arguments | `injectAutoDiscovery` |
| `useLoadedAuthRequest` | `useLoadedAuthRequest(config, discovery, RequestClass)` | same name | `injectLoadedAuthRequest` |
| `useAuthRequestResult` | `useAuthRequestResult(request, discovery, options?)` | same name | `injectAuthRequestResult` |
| `useAuthRequest` | `useAuthRequest(config, discovery)` | same name | `injectAuthRequest` |
| Google `useAuthRequest` / `useIdTokenAuthRequest` | `useGoogleAuthRequest` / `useGoogleIdTokenAuthRequest` | same names | `injectGoogleAuthRequest` / `injectGoogleIdTokenAuthRequest` |
| Facebook `useAuthRequest` | `useFacebookAuthRequest` | same name | `injectFacebookAuthRequest` |

Each returns `[request, result, promptAsync]`, as boxes in the adapter's own shape (a `ShallowRef`
in Vue, an accessor in Solid, `{ current }` in Svelte, a `Signal` in Angular; React returns the
values). Arguments are getters in Solid, Svelte and Angular, refs or getters in Vue.

Provider hooks are flat exports with the provider in the name, since there is no `providers/*`
subpath. The Google hook exchanges the code for a token on its own when the code flow is used, the
id token is then in `result.params.id_token`. Off web, `useGoogleIdTokenAuthRequest` follows the
default code flow, as upstream does.

## Shape

```
src/core/         AuthRequest, TokenRequest family, Discovery, Errors, PKCE, Base64, QueryParams,
                  Fetch, AuthSession (dismiss/makeRedirectUri/loadAsync), providers/{google,facebook},
                  the hook controllers and `createAuthRequestHooks`
src/{react,vue,solid,svelte,angular}/   each adapter's hook bindings
```

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

## Common questions

- **Which redirect URI do I register?** Print `makeRedirectUri({ scheme })`: `my-scheme://redirect`
  in a development build. Register exactly that string with the provider.
- **`request` is `null`.** `useAuthRequest` loads it asynchronously; disable the button until it is set.
- **PKCE?** On by default; pass `request.codeVerifier` as `extraParams` when exchanging the code.
- **Redirect lost on iOS.** Check the scheme is registered in the native project.

Sources: [Expo docs: AuthSession](https://docs.expo.dev/versions/latest/sdk/auth-session/),
[Expo guide: authentication](https://docs.expo.dev/guides/authentication/),
[expo/expo#10514](https://github.com/expo/expo/issues/10514).

## Test it

```bash
pnpm vitest run packages/auth-session
```
