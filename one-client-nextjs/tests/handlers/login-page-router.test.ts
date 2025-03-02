import { parse as urlParse } from 'url';
import { withoutApi, withApi } from '../fixtures/default-settings';
import { decodeState } from '../../src/eartho-session/utils/encoding';
import { setup, teardown } from '../fixtures/setup';
import { get, getCookie } from '../eartho-session/fixtures/helpers';
import { CookieJar } from 'tough-cookie';

describe('login handler (page router)', () => {
  afterEach(teardown);

  test('should create a state, nonce, and code verifier', async () => {
    const baseUrl = await setup(withoutApi);
    const cookieJar = new CookieJar();
    await get(baseUrl, '/api/auth/login', { cookieJar });

    expect(cookieJar.getCookiesSync(baseUrl)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'auth_verification',
          value: expect.any(String),
          path: '/',
          sameSite: 'lax'
        })
      ])
    );
  });

  test('should add returnTo to the state', async () => {
    const baseUrl = await setup(withoutApi, { loginOptions: { returnTo: '/custom-url' } });
    const cookieJar = new CookieJar();
    await get(baseUrl, '/api/auth/login', { cookieJar });

    const { value: authVerification } = getCookie('auth_verification', cookieJar, baseUrl)!;
    const state = JSON.parse(decodeURIComponent(authVerification).split('.')[0]).state;
    expect(state).toBeTruthy();

    const decodedState = decodeState(state);
    expect(decodedState?.returnTo).toEqual('/custom-url');
  });

  test('should redirect to the identity provider', async () => {
    const baseUrl = await setup(withoutApi);
    const cookieJar = new CookieJar();
    const {
      res: { statusCode, headers }
    } = await get(baseUrl, '/api/auth/login', { cookieJar, fullResponse: true });

    expect(statusCode).toBe(302);

    const { value: authVerification } = getCookie('auth_verification', cookieJar, baseUrl)!;
    const state = JSON.parse(decodeURIComponent(authVerification).split('.')[0]).state;
    expect(urlParse(headers.location, true)).toMatchObject({
      protocol: 'https:',
      host: 'acme.eartho.local',
      hash: null,
      query: {
        client_id: '__test_client_id__',
        scope: 'openid profile email',
        response_type: 'code',
        redirect_uri: 'http://www.acme.com/api/auth/callback',
        nonce: expect.any(String),
        state,
        code_challenge: expect.any(String),
        code_challenge_method: 'S256'
      },
      pathname: '/authorize'
    });
  });

  test('should allow sending custom parameters to the authorization server', async () => {
    const loginOptions = {
      authorizationParams: {
        max_age: 123,
        login_hint: 'foo@acme.com',
        ui_locales: 'nl',
        scope: 'some other scope openid',
        foo: 'bar',
        organization: 'foo',
        invitation: 'bar'
      }
    };
    const baseUrl = await setup(withoutApi, { loginOptions });
    const cookieJar = new CookieJar();
    const {
      res: { statusCode, headers }
    } = await get(baseUrl, '/api/auth/login', { cookieJar, fullResponse: true });

    expect(statusCode).toBe(302);
    expect(urlParse(headers.location, true)).toMatchObject({
      query: {
        ...loginOptions.authorizationParams,
        max_age: '123'
      }
    });
  });

  test('should pass organization config to the authorization server', async () => {
    const baseUrl = await setup({ ...withoutApi, organization: 'foo' });
    const cookieJar = new CookieJar();
    const {
      res: { statusCode, headers }
    } = await get(baseUrl, '/api/auth/login', { cookieJar, fullResponse: true });

    expect(statusCode).toBe(302);
    expect(urlParse(headers.location, true)).toMatchObject({
      query: {
        organization: 'foo'
      }
    });
  });

  test('should prefer organization auth param to config', async () => {
    const baseUrl = await setup(
      { ...withoutApi, organization: 'foo' },
      { loginOptions: { authorizationParams: { organization: 'bar' } } }
    );
    const cookieJar = new CookieJar();
    const {
      res: { statusCode, headers }
    } = await get(baseUrl, '/api/auth/login', { cookieJar, fullResponse: true });

    expect(statusCode).toBe(302);
    expect(urlParse(headers.location, true)).toMatchObject({
      query: {
        organization: 'bar'
      }
    });
  });

  test('should allow adding custom data to the state', async () => {
    const loginOptions = {
      getLoginState: (): Record<string, any> => {
        return {
          foo: 'bar'
        };
      }
    };
    const baseUrl = await setup(withoutApi, { loginOptions });
    const cookieJar = new CookieJar();
    await get(baseUrl, '/api/auth/login', { cookieJar });

    const { value: authVerification } = getCookie('auth_verification', cookieJar, baseUrl)!;
    const state = JSON.parse(decodeURIComponent(authVerification).split('.')[0]).state;

    const decodedState = decodeState(state);
    expect(decodedState).toEqual({
      foo: 'bar',
      returnTo: 'http://www.acme.com/'
    });
  });

  test('should merge returnTo and state', async () => {
    const loginOptions = {
      returnTo: '/profile',
      getLoginState: (): Record<string, any> => {
        return {
          foo: 'bar'
        };
      }
    };
    const baseUrl = await setup(withoutApi, { loginOptions });
    const cookieJar = new CookieJar();
    await get(baseUrl, '/api/auth/login', { cookieJar });

    const { value: authVerification } = getCookie('auth_verification', cookieJar, baseUrl)!;
    const state = JSON.parse(decodeURIComponent(authVerification).split('.')[0]).state;

    const decodedState = decodeState(state);
    expect(decodedState).toEqual({
      foo: 'bar',
      returnTo: '/profile'
    });
  });

  test('should allow the getState method to overwrite returnTo', async () => {
    const loginOptions = {
      returnTo: '/profile',
      getLoginState: (): Record<string, any> => {
        return {
          foo: 'bar',
          returnTo: '/foo'
        };
      }
    };
    const baseUrl = await setup(withoutApi, { loginOptions });
    const cookieJar = new CookieJar();
    await get(baseUrl, '/api/auth/login', { cookieJar });

    const { value: authVerification } = getCookie('auth_verification', cookieJar, baseUrl)!;
    const state = JSON.parse(decodeURIComponent(authVerification).split('.')[0]).state;

    const decodedState = decodeState(state);
    expect(decodedState).toEqual({
      foo: 'bar',
      returnTo: '/foo'
    });
  });

  test('should allow the returnTo url to be provided in the querystring', async () => {
    const loginOptions = {
      returnTo: '/profile'
    };
    const baseUrl = await setup(withoutApi, { loginOptions });
    const cookieJar = new CookieJar();
    await get(baseUrl, '/api/auth/login?returnTo=/foo', { cookieJar });
    const { value: authVerification } = getCookie('auth_verification', cookieJar, baseUrl)!;
    const state = JSON.parse(decodeURIComponent(authVerification).split('.')[0]).state;

    const decodedState = decodeState(state);
    expect(decodedState).toEqual({
      returnTo: new URL('/foo', withoutApi.baseURL).toString()
    });
  });

  test('should take the first returnTo url provided in the querystring', async () => {
    const loginOptions = {
      returnTo: '/profile'
    };
    const baseUrl = await setup(withoutApi, { loginOptions });
    const cookieJar = new CookieJar();
    await get(baseUrl, '/api/auth/login?returnTo=/foo&returnTo=/bar', { cookieJar });
    const { value: authVerification } = getCookie('auth_verification', cookieJar, baseUrl)!;
    const state = JSON.parse(decodeURIComponent(authVerification).split('.')[0]).state;

    const decodedState = decodeState(state);
    expect(decodedState).toEqual({
      returnTo: new URL('/foo', withoutApi.baseURL).toString()
    });
  });

  test('should not allow absolute urls to be provided in the querystring', async () => {
    const loginOptions = {
      returnTo: '/default-redirect'
    };
    const baseUrl = await setup(withoutApi, { loginOptions });

    const cookieJar = new CookieJar();
    await get(baseUrl, '/api/auth/login?returnTo=https://www.google.com', { cookieJar });
    const { value: authVerification } = getCookie('auth_verification', cookieJar, baseUrl)!;
    const state = JSON.parse(decodeURIComponent(authVerification).split('.')[0]).state;

    const decodedState = decodeState(state);
    expect(decodedState).toEqual({});
  });

  test('should allow absolute urls in params of returnTo urls', async () => {
    const loginOptions = {
      returnTo: '/default-redirect'
    };
    const baseUrl = await setup(withoutApi, { loginOptions });

    const cookieJar = new CookieJar();
    await get(baseUrl, '/api/auth/login?returnTo=/foo?url=https://www.google.com', { cookieJar });
    const { value: authVerification } = getCookie('auth_verification', cookieJar, baseUrl)!;
    const state = JSON.parse(decodeURIComponent(authVerification).split('.')[0]).state;

    const decodedState = decodeState(state);
    expect(decodedState).toEqual({
      returnTo: new URL('/foo?url=https://www.google.com', withoutApi.baseURL).toString()
    });
  });

  test('should redirect relative to the redirect_uri over the base url', async () => {
    const loginOptions = {
      returnTo: '/default-redirect',
      authorizationParams: {
        redirect_uri: 'https://other-org.acme.com/api/auth/callback'
      }
    };
    const baseUrl = await setup(withoutApi, { loginOptions });

    const cookieJar = new CookieJar();
    await get(baseUrl, '/api/auth/login?returnTo=/foo', { cookieJar });
    const { value: authVerification } = getCookie('auth_verification', cookieJar, baseUrl)!;
    const state = JSON.parse(decodeURIComponent(authVerification).split('.')[0]).state;

    const decodedState = decodeState(state);
    expect(decodedState).toEqual({
      returnTo: 'https://other-org.acme.com/foo'
    });
  });

  test('should allow the returnTo to be be overwritten by getState() when provided in the querystring', async () => {
    const loginOptions = {
      returnTo: '/profile',
      getLoginState: (): Record<string, any> => {
        return {
          returnTo: '/foo'
        };
      }
    };
    const baseUrl = await setup(withoutApi, { loginOptions });
    const cookieJar = new CookieJar();
    await get(baseUrl, '/api/auth/login', { cookieJar });
    const { value: authVerification } = getCookie('auth_verification', cookieJar, baseUrl)!;
    const state = JSON.parse(decodeURIComponent(authVerification).split('.')[0]).state;

    const decodedState = decodeState(state);
    expect(decodedState).toEqual({
      returnTo: '/foo'
    });
  });

  test('should redirect to the identity provider with scope and audience', async () => {
    const baseUrl = await setup(withApi);
    const {
      res: { statusCode, headers }
    } = await get(baseUrl, '/api/auth/login', { fullResponse: true });

    expect(statusCode).toBe(302);

    expect(urlParse(headers.location, true).query).toMatchObject({
      scope: 'openid profile read:customer',
      audience: 'https://api.acme.com'
    });
  });

  test('should handle login errors', async () => {
    const baseUrl = await setup(withApi, {
      loginOptions: {
        getLoginState() {
          return 1 as any;
        }
      }
    });
    await expect(get(baseUrl, '/api/auth/login', { fullResponse: true })).rejects.toThrowError(
      /Login handler failed. CAUSE: Custom state value must be an object/
    );
  });

  test('should redirect to the identity provider', async () => {
    const baseUrl = await setup({
      ...withoutApi,
      clientSecret: '__test_client_secret__',
      clientAuthMethod: 'client_secret_post',
      pushedAuthorizationRequests: true
    });
    const cookieJar = new CookieJar();
    const {
      res: { statusCode, headers }
    } = await get(baseUrl, '/api/auth/login', { cookieJar, fullResponse: true });

    expect(statusCode).toBe(302);
    expect(urlParse(headers.location, true)).toMatchObject({
      protocol: 'https:',
      host: 'acme.eartho.local',
      hash: null,
      query: {
        request_uri: 'foo',
        response_type: 'code',
        scope: 'openid',
        client_id: '__test_client_id__'
      },
      pathname: '/authorize'
    });
  });
});
