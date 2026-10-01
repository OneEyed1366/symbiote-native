import { Component, signal } from '@angular/core';
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
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

function need(text: string, label: string): string {
  if (text.trim() === '') {
    throw new Error(`fill the ${label} field first`);
  }
  return text.trim();
}

@Component({
  selector: 'AppIntegrityScreen',
  standalone: true,
  imports: [CallConsole, Field, ResultRow, Scenario, ScreenShell],
  template: `
    <ScreenShell
      [route]="route"
      testID="app-integrity-scroll"
      title="App Integrity"
      body="Let your server trust the client: prove a request comes from your genuine, unmodified app on a real device, with Apple App Attest, Google Play Integrity or hardware-backed Android keys."
    >
      <Scenario
        testID="app-integrity-attest-card"
        title="Prove to your server that a request comes from your real iOS app"
        why="Stops bots, modified apps and emulators from abusing your API: the device signs a server challenge with a key only the genuine app on genuine Apple hardware can hold."
        [steps]="attestSteps"
        expect="Each call returns an id or a base64 blob. On the simulator App Attest is unsupported, so run this on a real device."
      >
        <ResultRow
          testID="app-integrity-supported"
          label="isSupported"
          [value]="supported"
        />
        <Field
          testID="app-integrity-key-id-input"
          label="keyId"
          [(value)]="keyId"
          placeholder="filled by generateKeyAsync"
        />
        <Field
          testID="app-integrity-challenge-input"
          label="challenge"
          [(value)]="challenge"
        />
        <CallConsole
          isBare
          prefix="app-integrity-ios"
          title="App Attest calls"
          [color]="color"
          hint="Needs a real device, App Attest is unavailable on the simulator."
          [calls]="attestCalls"
        />
      </Scenario>

      <Scenario
        testID="app-integrity-play-card"
        title="Get a Google verdict on the device and the app (Android)"
        why="Ask Google whether the app is the unmodified Play build on a genuine device before a sensitive action such as a payment or a login."
        [steps]="playSteps"
        expect="You get an integrity token to send to your server, which decodes it with Google. Without a project number the call fails with a clear message."
      >
        <Field
          testID="app-integrity-project-input"
          label="cloudProjectNumber"
          [(value)]="cloudProjectNumber"
          placeholder="Google Cloud project number"
        />
        <Field
          testID="app-integrity-hash-input"
          label="requestHash"
          [(value)]="requestHash"
        />
        <CallConsole
          isBare
          prefix="app-integrity-play"
          title="Play Integrity calls"
          [color]="color"
          [calls]="playCalls"
        />
      </Scenario>

      <Scenario
        testID="app-integrity-hardware-card"
        title="Create a key that provably lives in secure hardware (Android)"
        why="For strong device binding: generate a key inside the secure chip and get a certificate chain that proves it was not extracted or emulated."
        [steps]="hardwareSteps"
        expect="Support reports true or false, the key is created under the alias, and the chain is a list of certificates your server can verify."
      >
        <Field
          testID="app-integrity-alias-input"
          label="keyAlias"
          [(value)]="keyAlias"
        />
        <Field
          testID="app-integrity-hardware-challenge-input"
          label="challenge"
          [(value)]="hardwareChallenge"
        />
        <CallConsole
          isBare
          prefix="app-integrity-hardware"
          title="Hardware attestation calls"
          [color]="color"
          [calls]="hardwareCalls"
        />
      </Scenario>
    </ScreenShell>
  `,
})
export class AppIntegrityScreen {
  readonly route = ROUTE_NAME.AppIntegrity;
  readonly color = lineColorOf(ROUTE_NAME.AppIntegrity);
  readonly supported = String(isSupported);
  readonly attestSteps = [
    'Press generateKeyAsync',
    'Press attestKeyAsync, then generateAssertionAsync',
    'Send the results to your server (not part of this demo)',
  ];
  readonly playSteps = [
    'Enter your Google Cloud project number',
    'Press prepareIntegrityTokenProviderAsync',
    'Press requestIntegrityCheckAsync',
  ];
  readonly hardwareSteps = [
    'Press isHardwareAttestationSupportedAsync',
    'Press generateHardwareAttestedKeyAsync',
    'Press getAttestationCertificateChainAsync',
  ];

  readonly keyId = signal('');
  readonly challenge = signal('server-issued-nonce');
  readonly cloudProjectNumber = signal('');
  readonly requestHash = signal('request-payload-hash');
  readonly keyAlias = signal('symbiote-canary-key');
  readonly hardwareChallenge = signal('server-issued-nonce');

  readonly attestCalls = [
    {
      label: 'generateKeyAsync',
      run: async () => {
        const id = await generateKeyAsync();
        this.keyId.set(id);
        return id;
      },
    },
    {
      label: 'attestKeyAsync',
      run: () => attestKeyAsync(need(this.keyId(), 'keyId'), this.challenge()),
    },
    {
      label: 'generateAssertionAsync',
      run: () =>
        generateAssertionAsync(need(this.keyId(), 'keyId'), this.challenge()),
    },
  ];

  readonly playCalls = [
    {
      label: 'prepareIntegrityTokenProviderAsync',
      run: () =>
        prepareIntegrityTokenProviderAsync(
          need(this.cloudProjectNumber(), 'cloudProjectNumber'),
        ),
    },
    {
      label: 'requestIntegrityCheckAsync',
      run: () => requestIntegrityCheckAsync(this.requestHash()),
    },
  ];

  readonly hardwareCalls = [
    {
      label: 'isHardwareAttestationSupportedAsync',
      run: () => isHardwareAttestationSupportedAsync(),
    },
    {
      label: 'generateHardwareAttestedKeyAsync',
      run: () =>
        generateHardwareAttestedKeyAsync(
          this.keyAlias(),
          this.hardwareChallenge(),
        ),
    },
    {
      label: 'getAttestationCertificateChainAsync',
      run: () => getAttestationCertificateChainAsync(this.keyAlias()),
    },
  ];
}
