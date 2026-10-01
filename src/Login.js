import React, { useState } from 'react';
import AuthLayout from './AuthLayout';
import Link, { navigate } from './router';
import * as api from './api';

export default function Login() {
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    try {
      console.log("logged in");
      // Stores the token/player id that src/api.js reads on startup.
      await api.login(userName.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      console.log("err");
      setError(err.message);
    }
  };
  return (
    <AuthLayout title="Ocean Market — Login">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="user_name"
          placeholder="username"
          autoComplete="username"
          value={userName}
          onChange={(event) => setUserName(event.target.value)}
          required
        />
        <input
          type="password"
          name="password"
          placeholder="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button type="submit">Login</button>
      </form>
      <p className="auth-error" role="alert">{error}</p>
      <Link to="/register">No account?</Link>
    </AuthLayout>
  );
}
