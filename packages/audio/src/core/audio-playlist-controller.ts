import type { IResourceController } from '@symbiote-native/engine';
import { createJsonKeyedResourceController } from './json-keyed-resource-controller';
import { createAudioPlaylist, type AudioPlaylist } from './audio-playlist';
import type { IAudioPlaylistOptions } from './types';

export function createAudioPlaylistController(): IResourceController<
  IAudioPlaylistOptions,
  AudioPlaylist
> {
  return createJsonKeyedResourceController<
    IAudioPlaylistOptions,
    AudioPlaylist
  >(createAudioPlaylist, playlist => playlist.destroy());
}
