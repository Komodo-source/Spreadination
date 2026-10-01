import React, { useEffect } from 'react';
import './auth.css';
import background from './assets/TSAKOS-OCTOBER-7.jpeg';

// Shared shell for the /login and /register screens: the background photo and
// grey card that the standalone HTML files used to draw.
export default function AuthLayout({ title, children }) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <main className="auth-screen" style={{ backgroundImage: `url(${background})` }}>
      <div className="auth-column">
        <h1>Ocean Market</h1>
        {children}
      </div>
    </main>
  );
}
