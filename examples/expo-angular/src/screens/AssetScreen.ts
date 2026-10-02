import { Component, computed, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  ANDROID_EMBEDDED_URL_BASE_RESOURCE,
  Asset,
} from '@symbiote-native/asset/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Explorer } from '../components/Explorer';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { AssetHookProbe } from './AssetHookProbe';

const BUNDLED_MODULE = require('../../assets/bootsplash-logo.svg');
const SAMPLE_IMAGE = 'https://reactnative.dev/img/tiny_logo.png';
const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp'] as const;
type IImageType = (typeof IMAGE_TYPES)[number];
const LAST_IMAGE_STYLE = { width: '100%', height: 120 };

function isImageType(type: string): type is IImageType {
  return IMAGE_TYPES.some(candidate => candidate === type);
}

@Component({
  selector: 'AssetScreen',
  standalone: true,
  imports: [
    AssetHookProbe,
    CallConsole,
    Card,
    Explorer,
    Field,
    ResultRow,
    Scenario,
    ScreenShell,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="asset-scroll"
      title="Asset"
      body="Treat images, sounds and other files as one thing whether they are bundled with the app or live on a server: resolve them to an Asset, download once to the cache and get a local file path."
    >
      <Scenario
        testID="asset-download-scenario"
        title="Download a remote file once and use it offline"
        why="Cache a server image or a sound on first use, then read it from a local path afterwards. The Asset object tracks the download state for you."
        [steps]="downloadSteps"
        expect="The call returns a local file path, and the Last asset card shows the name, type and sizes. The second press returns the same path without downloading again."
      >
        <CallConsole
          isBare
          prefix="asset-download"
          title="Asset instance"
          [color]="color"
          [calls]="downloadCalls"
        />
      </Scenario>

      @if (asset(); as current) {
        <Card testID="asset-last-card" title="Last asset">
          @for (row of rows(); track row[0]) {
            <ResultRow
              [testID]="'asset-last-' + row[0]"
              [label]="row[0]"
              [value]="row[1]"
            />
          }
          @if (isImage(current.type)) {
            <image
              testID="asset-last-image"
              [source]="{ uri: current.localUri ?? current.uri }"
              [style]="imageStyle"
              resizeMode="contain"
            ></image>
          }
        </Card>
      }

      <Scenario
        testID="asset-hook-card"
        title="Preload the assets a screen needs"
        why="Resolve and download bundled images or sounds before first paint so the screen never shows a half-loaded state."
        [steps]="hookSteps"
        expect="The row shows the loaded state and the names of the assets that were resolved."
      >
        <ToggleRow
          testID="asset-hook-switch"
          label="mount a component calling useAssets(moduleId)"
          [(value)]="isHookMounted"
          [color]="color"
        />
        @if (isHookMounted()) {
          <AssetHookProbe />
        }
      </Scenario>

      <Explorer testID="asset-explorer" [color]="color">
        <ng-template>
          <Card testID="asset-input-card" title="Sources">
            <Field
              testID="asset-uri-input"
              label="remote uri"
              [(value)]="uri"
            />
            <ResultRow
              testID="asset-android-base"
              label="ANDROID_EMBEDDED_URL_BASE_RESOURCE"
              [value]="androidBase"
            />
          </Card>
          <CallConsole
            prefix="asset-static"
            title="Asset statics"
            [color]="color"
            hint="fromModule with a require() id resolves the bundled svg, the object form and the string form take a uri."
            [calls]="staticCalls"
          />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class AssetScreen {
  readonly route = ROUTE_NAME.Asset;
  readonly color = lineColorOf(ROUTE_NAME.Asset);
  readonly androidBase = ANDROID_EMBEDDED_URL_BASE_RESOURCE;
  readonly imageStyle = LAST_IMAGE_STYLE;
  readonly isImage = isImageType;
  readonly downloadSteps = [
    'Press downloadAsync (remote uri), the sample image is preset',
    'Look at the Last asset card',
    'Press it again',
  ];
  readonly hookSteps = ['Turn the switch on', 'Read the result row'];

  readonly uri = signal(SAMPLE_IMAGE);
  readonly asset = signal<Asset | null>(null);
  readonly isHookMounted = signal(false);

  readonly rows = computed((): [string, string][] => {
    const current = this.asset();
    if (current === null) {
      return [];
    }
    return [
      ['name', current.name],
      ['type', current.type],
      ['hash', String(current.hash)],
      ['uri', current.uri],
      ['localUri', String(current.localUri)],
      ['width', String(current.width)],
      ['height', String(current.height)],
      ['downloaded', String(current.downloaded)],
    ];
  });

  private remember(next: Asset): Asset {
    this.asset.set(next);
    return next;
  }

  readonly downloadCalls = [
    {
      label: 'downloadAsync (last asset)',
      run: async () => {
        const current = this.asset();
        if (current === null) {
          throw new Error('create an asset with one of the statics first');
        }
        return this.remember(await current.downloadAsync()).localUri;
      },
    },
    {
      label: 'downloadAsync (remote uri)',
      run: async () =>
        this.remember(await Asset.fromURI(this.uri()).downloadAsync()).localUri,
    },
  ];

  readonly staticCalls = [
    {
      label: 'fromModule(require)',
      run: async () => this.remember(Asset.fromModule(BUNDLED_MODULE)).name,
    },
    {
      label: 'fromModule({ uri, width, height })',
      run: async () =>
        this.remember(
          Asset.fromModule({ uri: this.uri(), width: 100, height: 100 }),
        ).uri,
    },
    {
      label: 'fromModule(string)',
      run: async () => this.remember(Asset.fromModule(this.uri())).uri,
    },
    {
      label: 'fromURI',
      run: async () => this.remember(Asset.fromURI(this.uri())).uri,
    },
    {
      label: 'fromMetadata',
      run: async () =>
        this.remember(
          Asset.fromMetadata({
            name: 'tiny_logo',
            type: 'png',
            hash: 'canary-hash',
            httpServerLocation: 'https://reactnative.dev/img',
            scales: [1],
            width: 64,
            height: 64,
          }),
        ).uri,
    },
    {
      label: 'loadAsync(require)',
      run: async () =>
        (await Asset.loadAsync(BUNDLED_MODULE)).map(
          item => this.remember(item).name,
        ),
    },
    {
      label: 'loadAsync([ids])',
      run: async () => (await Asset.loadAsync([BUNDLED_MODULE])).length,
    },
  ];
}
