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
};

export function linkPackage(manifest: ISymbioteExpoLinkManifest): void;
export function findAppRoot(): string | null;
