import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Login from './Login';
import Register from './Register';
import { clearSession, isSignedIn } from './api';
import { currentPath } from './router';

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
});

const session = { token: 'token-1', player: { id_player: 'player-1' } };

const fillIn = (userName, password) => {
  fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: userName } });
  fireEvent.change(screen.getByPlaceholderText('password'), { target: { value: password } });
};

const submit = (label) => {
  fireEvent.submit(screen.getByRole('button', { name: label }).closest('form'));
};

describe('/login', () => {
  beforeEach(() => {
    clearSession();
    window.history.replaceState({}, '', '/');
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, session));
  });

  afterEach(() => {
    clearSession();
  });

  it('trims the username, signs in and stores the session', async () => {
    render(<Login />);

    fillIn('  trader  ', 'hunter2hunter2');
    submit(/login/i);

    await waitFor(() => expect(isSignedIn()).toBe(true));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/login'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      user_name: 'trader',
      password: 'hunter2hunter2',
    });
    expect(currentPath()).toBe('/');
  });

  it('surfaces the backend error and stays signed out', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(401, { error: 'Bad credentials' }));

    render(<Login />);

    fillIn('trader', 'nope');
    submit(/login/i);

    // The alert node is always mounted, so wait for its text rather than for it.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Bad credentials'));
    expect(isSignedIn()).toBe(false);
  });

  it('links to the register page', () => {
    render(<Login />);

    fireEvent.click(screen.getByRole('link', { name: /no account/i }));

    expect(currentPath()).toBe('/register');
  });
});

describe('/register', () => {
  beforeEach(() => {
    clearSession();
    window.history.replaceState({}, '', '/');
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(201, session));
  });

  afterEach(() => {
    clearSession();
  });

  it('creates the account against the register endpoint', async () => {
    render(<Register />);

    fillIn('trader', 'hunter2hunter2');
    submit(/create account/i);

    await waitFor(() => expect(isSignedIn()).toBe(true));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/register'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      user_name: 'trader',
      password: 'hunter2hunter2',
    });
  });

  it('links back to the login page', () => {
    render(<Register />);

    fireEvent.click(screen.getByRole('link', { name: /already have an account/i }));

    expect(currentPath()).toBe('/login');
  });
});
