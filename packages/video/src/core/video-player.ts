import { expoVideo } from './native-module';
import type {
  IVideoPlayerBuilderOptions,
  IVideoSource,
  VideoPlayer,
} from './player-types';
import { parseSource } from './video-source';

const SYNC_REPLACE_WARNING =
  'On iOS `VideoPlayer.replace` loads the asset data synchronously on the main thread, which can lead to UI freezes and will be deprecated in a future release. Switch to `replaceAsync` for better user experience.';

// Upstream patches these two methods onto the native prototype at load, a subclass does the same
class SourceParsingVideoPlayer extends expoVideo.VideoPlayer {
  override replace(source: IVideoSource, disableWarning = false): void {
    if (!disableWarning) console.warn(SYNC_REPLACE_WARNING);
    super.replace(parseSource(source));
  }

  override replaceAsync(source: IVideoSource): Promise<void> {
    return super.replaceAsync(parseSource(source));
  }
}

/**
 * Creates a player that does not release automatically, call `release()` when done
 *
 * The adapter hooks release it on unmount
 */
export function createVideoPlayer(
  source: IVideoSource,
  playerBuilderOptions?: IVideoPlayerBuilderOptions,
): VideoPlayer {
  return new SourceParsingVideoPlayer(
    parseSource(source),
    false,
    playerBuilderOptions,
  );
}
