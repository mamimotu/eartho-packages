/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom/extend-expect';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import { fetchUserErrorMock, withEarthoProvider, user } from '../fixtures/frontend';
import { withPageAuthRequired } from '../../src/client';

describe('with-page-auth-required csr', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        assign: jest.fn(),
        toString: () => 'https://example.com'
      }
    });
  });
  afterEach(() => delete (global as any).fetch);

  it('should deny access to a CSR page when not authenticated', async () => {
    (global as any).fetch = fetchUserErrorMock;
    const MyPage = (): JSX.Element => <>Private</>;
    const ProtectedPage = withPageAuthRequired(MyPage);

    render(<ProtectedPage />, { wrapper: withEarthoProvider() });
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Private')).not.toBeInTheDocument());
  });

  it('should add user to props of CSR page when authenticated', async () => {
    const ProtectedPage = withPageAuthRequired(({ user }): JSX.Element => <>{user.email}</>);

    render(<ProtectedPage />, { wrapper: withEarthoProvider({ user }) });
    await waitFor(() => expect(window.location.assign).not.toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('foo@example.com')).toBeInTheDocument());
  });

  it('should show an empty element when redirecting', async () => {
    (global as any).fetch = fetchUserErrorMock;
    const MyPage = (): JSX.Element => <>Private</>;
    const ProtectedPage = withPageAuthRequired(MyPage);

    const { container } = render(<ProtectedPage />, { wrapper: withEarthoProvider() });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('should show a custom element when redirecting', async () => {
    (global as any).fetch = fetchUserErrorMock;
    const MyPage = (): JSX.Element => <>Private</>;
    const OnRedirecting = (): JSX.Element => <>Redirecting</>;
    const ProtectedPage = withPageAuthRequired(MyPage, { onRedirecting: OnRedirecting });

    render(<ProtectedPage />, { wrapper: withEarthoProvider() });
    await waitFor(() => expect(screen.getByText('Redirecting')).toBeInTheDocument());
  });

  it('should show an empty fallback in case of error', async () => {
    (global as any).fetch = fetchUserErrorMock;
    const MyPage = (): JSX.Element => <>Private</>;
    const ProtectedPage = withPageAuthRequired(MyPage);

    const { container } = render(<ProtectedPage />, { wrapper: withEarthoProvider() });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('should show a custom fallback in case of error', async () => {
    (global as any).fetch = fetchUserErrorMock;
    const MyPage = (): JSX.Element => <>Private</>;
    const OnError = (): JSX.Element => <>Error</>;
    const ProtectedPage = withPageAuthRequired(MyPage, { onError: OnError });

    render(<ProtectedPage />, { wrapper: withEarthoProvider() });
    await waitFor(() => expect(screen.getByText('Error')).toBeInTheDocument());
  });

  it('should use a custom login URL', async () => {
    process.env.NEXT_PUBLIC_EARTHO_LOGIN = '/api/foo';
    (global as any).fetch = fetchUserErrorMock;
    const MyPage = (): JSX.Element => <>Private</>;
    const ProtectedPage = withPageAuthRequired(MyPage);

    render(<ProtectedPage />, { wrapper: withEarthoProvider() });
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith(expect.stringContaining('/api/foo')));
    delete process.env.NEXT_PUBLIC_EARTHO_LOGIN;
  });

  it('should return to the root path', async () => {
    window.location.toString = jest.fn(() => 'https://example.net');
    (global as any).fetch = fetchUserErrorMock;
    const MyPage = (): JSX.Element => <>Private</>;
    const ProtectedPage = withPageAuthRequired(MyPage);

    render(<ProtectedPage />, { wrapper: withEarthoProvider() });
    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith(
        expect.stringContaining(`?returnTo=${encodeURIComponent('/')}`)
      )
    );
  });

  it('should return to the current path', async () => {
    window.location.toString = jest.fn(() => 'https://example.net/foo');
    (global as any).fetch = fetchUserErrorMock;
    const MyPage = (): JSX.Element => <>Private</>;
    const ProtectedPage = withPageAuthRequired(MyPage);

    render(<ProtectedPage />, { wrapper: withEarthoProvider() });
    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith(
        expect.stringContaining(`?returnTo=${encodeURIComponent('/foo')}`)
      )
    );
  });

  it('should accept a custom returnTo URL', async () => {
    (global as any).fetch = fetchUserErrorMock;
    const MyPage = (): JSX.Element => <>Private</>;
    const ProtectedPage = withPageAuthRequired(MyPage, { returnTo: '/foo' });

    render(<ProtectedPage />, { wrapper: withEarthoProvider() });
    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith(
        expect.stringContaining(`?returnTo=${encodeURIComponent('/foo')}`)
      )
    );
  });

  it('should preserve multiple query params in the returnTo URL', async () => {
    (global as any).fetch = fetchUserErrorMock;
    const MyPage = (): JSX.Element => <>Private</>;
    const ProtectedPage = withPageAuthRequired(MyPage, { returnTo: '/foo?bar=baz&qux=quux' });

    render(<ProtectedPage />, { wrapper: withEarthoProvider() });
    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalled();
    });
    const url = new URL((window.location.assign as jest.Mock).mock.calls[0][0], 'https://example.com');
    expect(url.searchParams.get('returnTo')).toEqual('/foo?bar=baz&qux=quux');
  });
});
