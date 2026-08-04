export type ISymbioteExpoLinkAndroidModule = {
  importPath: string;
  className: string;
  nativeName: string;
};

export type ISymbioteExpoLinkManifest = {
  android?: {
    gradleProjectName: string;
    modules: ISymbioteExpoLinkAndroidModule[];
  };
  ios?: {
    infoPlistKeys: Record<string, string>;
  };
};

export type ISymbioteExpoLinkEntry = {
  packageName: string;
  manifest: ISymbioteExpoLinkManifest;
};

/** Scans the app's node_modules and regenerates every native registration block. */
export function linkApp(appRoot?: string): void;
export function collectManifests(appRoot: string): ISymbioteExpoLinkEntry[];
export function findAppRoot(): string | null;
