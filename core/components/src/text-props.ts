// The ellipsize modes a Text accepts. The defaults are the platform's — `foldTextDefaults` in
// `SymbioteFabricProps.cpp` — reaching every `RCTText` whoever authored it. Declaring both props
// with neither defaulted silently falls back to native's own `clip`: no error, just wrong text.

export type IEllipsizeMode = 'head' | 'middle' | 'tail' | 'clip';
