import { createSignal } from 'solid-js';
import type {
  IDiscoveryDocument,
  TokenResponse,
} from '@symbiote-native/auth-session/solid';
import { Explorer, Scenario } from '../components/Scenario';
import { ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { ProviderCards } from './auth-session-providers';
import {
  ConfigCard,
  DiscoveryCard,
  HookFlowCard,
  INITIAL_FORM,
  ManualFlowCard,
  RedirectCard,
  ResultCard,
} from './auth-session-request';
import type { IForm, ISetForm } from './auth-session-request';
import { TokenCards } from './auth-session-tokens';

export function AuthSessionScreen() {
  const [form, setFormState] = createSignal<IForm>(INITIAL_FORM);
  const [discovery, setDiscovery] = createSignal<IDiscoveryDocument | null>(null);
  const [token, setToken] = createSignal<TokenResponse | null>(null);
  const [result, setResult] = createSignal<unknown>(null);
  const setForm: ISetForm = patch =>
    setFormState(previous => ({ ...previous, ...patch }));

  return (
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
      />
      <RedirectCard form={form()} setForm={setForm} />
      <DiscoveryCard form={form()} setForm={setForm} discovery={discovery()} setDiscovery={setDiscovery} />
      <ConfigCard form={form()} setForm={setForm} />
      <ManualFlowCard form={form()} discovery={discovery()} onResult={setResult} />
      <ResultCard result={result()} />
      <Explorer testID="auth-session-explorer" color={lineColorOf(ROUTE_NAME.AuthSession)}>
        <HookFlowCard form={form()} discovery={discovery()} onResult={setResult} />
        <TokenCards form={form()} discovery={discovery()} token={token()} setToken={setToken} />
        <ProviderCards />
      </Explorer>
    </ScreenShell>
  );
}
