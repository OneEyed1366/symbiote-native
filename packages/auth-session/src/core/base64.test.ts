import { describe, expect, it } from 'vitest';
import { encodeNoWrap } from './base64';

describe('encodeNoWrap', () => {
  it('creates the correct base64', () => {
    const clientId = encodeURIComponent('abda45500_e28b493972f524=');
    const clientSecret = encodeURIComponent(
      '8EXPOe14c3f3fbcc809bf3e0a7_BACON-c',
    );
    const credentials = `${clientId}:${clientSecret}`;
    expect(encodeNoWrap(credentials)).toBe(
      'YWJkYTQ1NTAwX2UyOGI0OTM5NzJmNTI0JTNEOjhFWFBPZTE0YzNmM2ZiY2M4MDliZjNlMGE3X0JBQ09OLWM=',
    );
  });
});
