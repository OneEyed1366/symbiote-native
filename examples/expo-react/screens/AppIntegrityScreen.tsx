import { useState } from 'react';
import {
  attestKeyAsync,
  generateAssertionAsync,
  generateHardwareAttestedKeyAsync,
  generateKeyAsync,
  getAttestationCertificateChainAsync,
  isHardwareAttestationSupportedAsync,
  isSupported,
  prepareIntegrityTokenProviderAsync,
  requestIntegrityCheckAsync,
} from '@symbiote-native/app-integrity';
import { CallConsole } from '../components/CallConsole';
import { Scenario } from '../components/Scenario';
import {
  Card,
  Field,
  ResultRow,
  ScreenShell,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.AppIntegrity;
const color = lineColorOf(ROUTE);

function need(text: string, label: string): string {
  if (text.trim() === '') {
    throw new Error(`fill the ${label} field first`);
  }
  return text.trim();
}

function AppAttestCard() {
  const [keyId, setKeyId] = useState('');
  const [challenge, setChallenge] = useState('server-issued-nonce');
  return (
    <Scenario
      testID="app-integrity-attest-card"
      title="Prove to your server that a request comes from your real iOS app"
      why="Stops bots, modified apps and emulators from abusing your API: the device signs a server challenge with a key only the genuine app on genuine Apple hardware can hold."
      steps={['Press generateKeyAsync', 'Press attestKeyAsync, then generateAssertionAsync', 'Send the results to your server (not part of this demo)']}
      expect="Each call returns an id or a base64 blob. On the simulator App Attest is unsupported, so run this on a real device."
    >
        <ResultRow
          testID="app-integrity-supported"
          label="isSupported"
          value={String(isSupported)}
        />
        <Field
          testID="app-integrity-key-id-input"
          label="keyId"
          value={keyId}
          onChange={setKeyId}
          placeholder="filled by generateKeyAsync"
        />
        <Field
          testID="app-integrity-challenge-input"
          label="challenge"
          value={challenge}
          onChange={setChallenge}
        />
      <CallConsole
        isBare
        prefix="app-integrity-ios"
        title="App Attest calls"
        color={color}
        hint="Needs a real device, App Attest is unavailable on the simulator."
        calls={[
          {
            label: 'generateKeyAsync',
            run: async () => {
              const id = await generateKeyAsync();
              setKeyId(id);
              return id;
            },
          },
          {
            label: 'attestKeyAsync',
            run: () => attestKeyAsync(need(keyId, 'keyId'), challenge),
          },
          {
            label: 'generateAssertionAsync',
            run: () => generateAssertionAsync(need(keyId, 'keyId'), challenge),
          },
        ]}
      />
    </Scenario>
  );
}

function PlayIntegrityCard() {
  const [cloudProjectNumber, setCloudProjectNumber] = useState('');
  const [requestHash, setRequestHash] = useState('request-payload-hash');
  return (
    <Scenario
      testID="app-integrity-play-card"
      title="Get a Google verdict on the device and the app (Android)"
      why="Ask Google whether the app is the unmodified Play build on a genuine device before a sensitive action such as a payment or a login."
      steps={['Enter your Google Cloud project number', 'Press prepareIntegrityTokenProviderAsync', 'Press requestIntegrityCheckAsync']}
      expect="You get an integrity token to send to your server, which decodes it with Google. Without a project number the call fails with a clear message."
    >
        <Field
          testID="app-integrity-project-input"
          label="cloudProjectNumber"
          value={cloudProjectNumber}
          onChange={setCloudProjectNumber}
          placeholder="Google Cloud project number"
        />
        <Field
          testID="app-integrity-hash-input"
          label="requestHash"
          value={requestHash}
          onChange={setRequestHash}
        />
      <CallConsole
        isBare
        prefix="app-integrity-play"
        title="Play Integrity calls"
        color={color}
        calls={[
          {
            label: 'prepareIntegrityTokenProviderAsync',
            run: () =>
              prepareIntegrityTokenProviderAsync(
                need(cloudProjectNumber, 'cloudProjectNumber'),
              ),
          },
          {
            label: 'requestIntegrityCheckAsync',
            run: () => requestIntegrityCheckAsync(requestHash),
          },
        ]}
      />
    </Scenario>
  );
}

function HardwareCard() {
  const [keyAlias, setKeyAlias] = useState('symbiote-canary-key');
  const [challenge, setChallenge] = useState('server-issued-nonce');
  return (
    <Scenario
      testID="app-integrity-hardware-card"
      title="Create a key that provably lives in secure hardware (Android)"
      why="For strong device binding: generate a key inside the secure chip and get a certificate chain that proves it was not extracted or emulated."
      steps={['Press isHardwareAttestationSupportedAsync', 'Press generateHardwareAttestedKeyAsync', 'Press getAttestationCertificateChainAsync']}
      expect="Support reports true or false, the key is created under the alias, and the chain is a list of certificates your server can verify."
    >
        <Field
          testID="app-integrity-alias-input"
          label="keyAlias"
          value={keyAlias}
          onChange={setKeyAlias}
        />
        <Field
          testID="app-integrity-hardware-challenge-input"
          label="challenge"
          value={challenge}
          onChange={setChallenge}
        />
      <CallConsole
        isBare
        prefix="app-integrity-hardware"
        title="Hardware attestation calls"
        color={color}
        calls={[
          {
            label: 'isHardwareAttestationSupportedAsync',
            run: () => isHardwareAttestationSupportedAsync(),
          },
          {
            label: 'generateHardwareAttestedKeyAsync',
            run: () => generateHardwareAttestedKeyAsync(keyAlias, challenge),
          },
          {
            label: 'getAttestationCertificateChainAsync',
            run: () => getAttestationCertificateChainAsync(keyAlias),
          },
        ]}
      />
    </Scenario>
  );
}

export function AppIntegrityScreen() {
  return (
    <ScreenShell
      route={ROUTE}
      testID="app-integrity-scroll"
      title="App Integrity"
      body="Let your server trust the client: prove a request comes from your genuine, unmodified app on a real device, with Apple App Attest, Google Play Integrity or hardware-backed Android keys."
    >
      <AppAttestCard />
      <PlayIntegrityCard />
      <HardwareCard />
    </ScreenShell>
  );
}
