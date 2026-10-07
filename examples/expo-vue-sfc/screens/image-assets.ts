const DEFAULT_SIZE = 600;

// Photo ids are strings: they are names, not quantities
export function photoUrl(id: string, size = DEFAULT_SIZE): string {
  return `https://picsum.photos/id/${id}/${size}/${size}`;
}

const THUMB_SIZE = 300;
export const GALLERY_URLS: string[] = [
  photoUrl('1015', THUMB_SIZE),
  photoUrl('1016', THUMB_SIZE),
  photoUrl('1020', THUMB_SIZE),
  photoUrl('1024', THUMB_SIZE),
];

export const BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';
export const GREY_BLURHASH = 'L02:*9WB00j[~qj[ayay00ay%Mj[';
export const ANIMATED_URI =
  'https://upload.wikimedia.org/wikipedia/commons/2/2c/Rotating_earth_%28large%29.gif';
