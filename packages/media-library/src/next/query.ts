import { expoMediaLibraryNext } from './native-module';
import { Asset } from './asset';

/**
 * A query builder over the media library, matching upstream's own trivial subclass
 * (`export class Query extends ExpoMediaLibraryNext.Query {}`) for every method but `exe()`:
 * the native call constructs its results off the BASE native asset class, never our own `Asset`
 * (asset.ts) — so without this override, a query result's iOS-only getters silently skip the
 * platform guard every other `Asset` gets. Re-wrapping by id is cheap (a shared-object handle,
 * not a data copy) and keeps `exe()` consistent with every other way of obtaining an `Asset`.
 */
export class Query extends expoMediaLibraryNext.Query {
  override async exe(): Promise<Asset[]> {
    const results = await super.exe();
    return results.map(result => new Asset(result.id));
  }
}
