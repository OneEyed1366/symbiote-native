import { expoAudio } from './native-module';
import { resolveSources } from './resolve-source';
import type { IAudioPlaylistOptions } from './types';

// No prototype shim on `AudioPlaylist` upstream (unlike `AudioPlayer`/`AudioRecorder`) — its
// `add`/`insert` take an already-resolved source, so a plain re-export is faithful to upstream.
export const AudioPlaylist = expoAudio.AudioPlaylist;
export type AudioPlaylist = InstanceType<typeof AudioPlaylist>;

/**
 * Creates an `AudioPlaylist` that does not release automatically — call `.destroy()` when done
 * with it. See `createAudioPlayer`'s doc comment for the same lifecycle note.
 */
export function createAudioPlaylist(
  options: IAudioPlaylistOptions = {},
): AudioPlaylist {
  const { sources = [], updateInterval = 500, loop = 'none' } = options;
  const resolvedSources = resolveSources(sources);
  return new AudioPlaylist(resolvedSources, updateInterval, loop);
}
