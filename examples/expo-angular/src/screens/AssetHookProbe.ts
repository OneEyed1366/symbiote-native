import { Component, computed, inject } from '@angular/core';
import { AssetsService } from '@symbiote-native/asset/angular';
import { ResultRow } from '../components/ResultRow';

const BUNDLED_MODULE = require('../../assets/bootsplash-logo.svg');

@Component({
  selector: 'AssetHookProbe',
  standalone: true,
  imports: [ResultRow],
  template: `<ResultRow
    testID="asset-hook-result"
    label="useAssets [assets, error]"
    [value]="resultText()"
  />`,
})
export class AssetHookProbe {
  private readonly loaded = inject(AssetsService).connect(BUNDLED_MODULE);

  readonly resultText = computed(() => {
    const { assets, error } = this.loaded;
    const failure = error();
    return failure === undefined
      ? `${assets()?.length ?? 0} loaded, downloaded ${String(assets()?.[0]?.downloaded)}`
      : failure.message;
  });
}
