// Moved to `@symbiote-native/components/fold-host-bag` (2026-09-01) and kept here as a re-export.
//
// It left this adapter the moment a SECOND adapter needed it: React's wrappers are being replaced
// by bare intrinsic tags, and a bare tag has no wrapper to fold in — the same "third path" this
// file was written for, arriving in an adapter that has no lowering transform either. A per-adapter
// copy of a fold driven by a shared spec is the duplication `<adapters_stay_thin>` exists to stop.
export {
  foldHostBag,
  FOLD_PLAN_BY_TAG as BY_TAG,
  type IHostBag,
} from '@symbiote-native/components/fold-host-bag';
