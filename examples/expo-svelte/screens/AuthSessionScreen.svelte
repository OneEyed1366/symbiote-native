<script lang="ts">
  import type {
    IDiscoveryDocument,
    TokenResponse,
  } from '@symbiote-native/auth-session/svelte';
  import Explorer from '../components/Explorer.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import AuthSessionConfig from './AuthSessionConfig.svelte';
  import AuthSessionDiscovery from './AuthSessionDiscovery.svelte';
  import AuthSessionHookFlows from './AuthSessionHookFlows.svelte';
  import AuthSessionManualFlow from './AuthSessionManualFlow.svelte';
  import AuthSessionProviders from './AuthSessionProviders.svelte';
  import AuthSessionRedirect from './AuthSessionRedirect.svelte';
  import AuthSessionResult from './AuthSessionResult.svelte';
  import AuthSessionTokens from './AuthSessionTokens.svelte';
  import { INITIAL_FORM } from './auth-session-form';
  import type { IForm } from './auth-session-form';

  const color = lineColorOf(ROUTE_NAME.AuthSession);

  let form = $state<IForm>({ ...INITIAL_FORM });
  let discovery = $state.raw<IDiscoveryDocument | null>(null);
  let token = $state.raw<TokenResponse | null>(null);
  let result = $state.raw<unknown>(null);

  function setForm(patch: Partial<IForm>): void {
    Object.assign(form, patch);
  }

  function setDiscovery(value: IDiscoveryDocument | null): void {
    discovery = value;
  }

  function setToken(value: TokenResponse | null): void {
    token = value;
  }

  function setResult(value: unknown): void {
    result = value;
  }
</script>

<ScreenShell
  route={ROUTE_NAME.AuthSession}
  testID="auth-session-scroll"
  title="Auth Session"
  body="Sign users in with any OAuth 2 or OpenID Connect provider through the system browser, with PKCE, token exchange and refresh. Ready-made flows for Google and Facebook."
>
  <Scenario
    testID="auth-session-scenario"
    title="Sign in with an identity provider"
    why="Let users log in with their existing account. The provider page opens in a secure browser, your app receives a code, exchanges it for tokens and never sees the password."
    steps={['Set the redirect scheme (canaryexpo is registered in this app)', 'Enter the provider issuer and your client id below', 'Press the manual flow button and sign in']}
    expect="The result card shows the authorization code or an error from the provider. The token cards below exchange and refresh it."
  >
  </Scenario>
  <AuthSessionRedirect {form} {setForm} {color} />
  <AuthSessionDiscovery {form} {setForm} {discovery} {setDiscovery} {color} />
  <AuthSessionConfig {form} {setForm} {color} />
  <AuthSessionManualFlow {form} {discovery} {color} onResult={setResult} />
  <AuthSessionResult {result} />
  <Explorer testID="auth-session-explorer" {color}>
    <AuthSessionHookFlows {form} {discovery} {color} onResult={setResult} />
    <AuthSessionTokens {form} {discovery} {token} {color} {setToken} />
    <AuthSessionProviders />
  </Explorer>
</ScreenShell>
