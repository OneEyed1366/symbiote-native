export type IPermissionLike = {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
  accessPrivileges?: string;
};

export function describePermission(response: IPermissionLike | null): string {
  if (response === null) {
    return 'loading…';
  }
  const privileges =
    response.accessPrivileges === undefined
      ? ''
      : `, accessPrivileges ${response.accessPrivileges}`;
  return `${response.status}, granted ${response.granted}, canAskAgain ${response.canAskAgain}${privileges}`;
}
