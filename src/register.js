import React, { useState } from 'react';
import AuthLayout from './AuthLayout';
import Link, { navigate } from './router';
import * as api from './api';

export default function Register() {
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    try {
      // Stores the token/player id that src/api.js reads on startup.
      await api.register(userName.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <AuthLayout title="Ocean Market — Register">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="user_name"
          placeholder="username"
          autoComplete="username"
          pattern="[A-Za-z0-9_.\-]{3,32}"
          title="3-32 characters: letters, numbers, _ . -"
          value={userName}
          onChange={(event) => setUserName(event.target.value)}
          required
        />
        <input
          type="password"
          name="password"
          placeholder="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button type="submit">Create account</button>
      </form>
      <p className="auth-hint">Username: 3-32 characters. Password: at least 8 characters.</p>
      <p className="auth-error" role="alert">{error}</p>
      <Link to="/login">Already have an account?</Link>
    </AuthLayout>
  );
}
