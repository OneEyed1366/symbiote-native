import { expoMediaLibraryNext } from './native-module';
import { Asset } from './asset';

/**
 * A media album (collection of assets) on the device, matching upstream's own trivial subclass
 * for every method but `getAssets()` — same reason as Query.exe(), see query.ts.
 */
export class Album extends expoMediaLibraryNext.Album {
  override async getAssets(): Promise<Asset[]> {
    const results = await super.getAssets();
    return results.map(result => new Asset(result.id));
  }
}
