export type IQueryParamsResult = {
  errorCode: string | null;
  params: Record<string, string>;
};

export function getQueryParams(input: string): IQueryParamsResult {
  const url = new URL(input, 'https://phony.example');

  const errorCode = url.searchParams.get('errorCode');
  url.searchParams.delete('errorCode');

  const params = Object.fromEntries(url.searchParams);
  if (url.hash) {
    new URLSearchParams(url.hash.replace(/^#/, '')).forEach((value, key) => {
      params[key] = value;
    });
  }

  return { errorCode, params };
}
