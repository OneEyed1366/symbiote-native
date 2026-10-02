export type IFetchHeaders = Record<string, string> & {
  'Content-Type': string;
  Authorization?: string;
  Accept?: string;
};

export type IFetchRequest = {
  headers?: IFetchHeaders;
  body?: Record<string, string>;
  dataType?: string;
  method?: string;
};

export function requestAsync<T>(
  requestUrl: string,
  fetchRequest: IFetchRequest & { dataType: 'json' },
): Promise<T>;
export function requestAsync(
  requestUrl: string,
  fetchRequest: IFetchRequest,
): Promise<string>;
export async function requestAsync<T>(
  requestUrl: string,
  fetchRequest: IFetchRequest,
): Promise<T | string> {
  const url = new URL(requestUrl);

  const headers: Record<string, string> = {};
  const request: RequestInit = {
    body: undefined,
    method: fetchRequest.method,
    mode: 'cors',
    headers,
  };

  const isJsonDataType = fetchRequest.dataType?.toLowerCase() === 'json';

  if (fetchRequest.headers) {
    for (const key in fetchRequest.headers) {
      const header = fetchRequest.headers[key];
      if (header != null) {
        headers[key] = header;
      }
    }
  }

  if (fetchRequest.body) {
    if (fetchRequest.method?.toUpperCase() === 'POST') {
      request.body = new URLSearchParams(fetchRequest.body).toString();
    } else {
      for (const [key, value] of Object.entries(fetchRequest.body)) {
        url.searchParams.append(key, value);
      }
    }
  }

  if (isJsonDataType && !headers.Accept && !headers.accept) {
    headers['Accept'] = 'application/json, text/javascript; q=0.01';
  }

  // React Native's URL implementation adds a trailing slash that the server doesn't expect.
  const correctedUrl = url.toString().replace(/\/$/, '');

  const response = await fetch(correctedUrl, request);

  const contentType = response.headers.get('content-type');
  if (isJsonDataType || contentType?.includes('application/json')) {
    return response.json();
  }
  return response.text();
}
