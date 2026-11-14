// The one call the lab's e2e test makes, typed here instead of adding @types/pngjs for it
declare module 'pngjs' {
  export const PNG: {
    sync: {
      read(buffer: Buffer): { width: number; height: number; data: Buffer };
    };
  };
}
