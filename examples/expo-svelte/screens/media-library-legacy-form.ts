import type {
  IMediaLibraryAssetsOptions,
  IMediaLibraryMediaSubtype,
  IMediaLibraryMediaTypeValue,
  IMediaLibrarySortByKey,
} from '@symbiote-native/media-library/legacy';
import { optionalNumber } from './media-library-helpers';

export const MEDIA_TYPES: readonly IMediaLibraryMediaTypeValue[] = [
  'photo',
  'video',
  'audio',
  'unknown',
];
export const SORT_KEYS: readonly IMediaLibrarySortByKey[] = [
  'default',
  'mediaType',
  'width',
  'height',
  'creationTime',
  'modificationTime',
  'duration',
];
export const NO_SORT = 'default';
const SUBTYPES: readonly IMediaLibraryMediaSubtype[] = [
  'depthEffect',
  'hdr',
  'highFrameRate',
  'livePhoto',
  'panorama',
  'screenshot',
  'stream',
  'timelapse',
  'spatialMedia',
  'videoCinematic',
];

export function toChoices(
  values: readonly string[],
): { label: string; value: string }[] {
  return values.map(value => ({ label: value, value }));
}

export type IAssetsForm = {
  first: string;
  after: string;
  album: string;
  sortBy: string;
  isAscending: boolean;
  mediaType: string;
  mediaSubtypes: string;
  createdAfter: string;
  createdBefore: string;
  resolveWithFullInfo: boolean;
};

export const INITIAL_ASSETS_FORM: IAssetsForm = {
  first: '5',
  after: '',
  album: '',
  sortBy: NO_SORT,
  isAscending: false,
  mediaType: 'photo',
  mediaSubtypes: '',
  createdAfter: '',
  createdBefore: '',
  resolveWithFullInfo: false,
};

export function toAssetsOptions(form: IAssetsForm): IMediaLibraryAssetsOptions {
  const requested = form.mediaSubtypes.split(',').map(item => item.trim());
  const subtypes = SUBTYPES.filter(subtype => requested.includes(subtype));
  const sortKey = SORT_KEYS.find(key => key === form.sortBy);
  return {
    first: optionalNumber(form.first),
    after: form.after.trim() === '' ? undefined : form.after.trim(),
    album: form.album.trim() === '' ? undefined : form.album.trim(),
    sortBy:
      sortKey === undefined || sortKey === NO_SORT
        ? undefined
        : [[sortKey, form.isAscending]],
    mediaType: MEDIA_TYPES.find(type => type === form.mediaType),
    mediaSubtypes: subtypes.length === 0 ? undefined : subtypes,
    createdAfter: optionalNumber(form.createdAfter),
    createdBefore: optionalNumber(form.createdBefore),
    resolveWithFullInfo: form.resolveWithFullInfo,
  };
}
