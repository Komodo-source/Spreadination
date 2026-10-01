import React, { useCallback, useEffect, useState } from 'react';
import Link, { navigate } from './router';
import * as api from './api';
import background from './assets/TSAKOS-OCTOBER-7.jpeg';
import './home.css';

// How many companies the board shows. The backend sends the whole ranking.
const MAX_ROWS = 10;

/** Money the way a shipping baron reads it: $2.5B rather than $2,500,000,000. */
export function formatMoney(value) {
  const amount = Number(value) || 0;
  const scales = [
    { limit: 1e12, suffix: 'T' },
    { limit: 1e9, suffix: 'B' },
    { limit: 1e6, suffix: 'M' },
    { limit: 1e3, suffix: 'K' },
  ];

  for (const { limit, suffix } of scales) {
    if (amount >= limit) {
      const scaled = amount / limit;
      return `$${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)}${suffix}`;
    }
  }

  return `$${amount.toLocaleString()}`;
}

/**
 * The screen a player lands on before a game: Play, the two stubs, and the world
 * ranking of companies by money. It talks to the public leaderboard endpoint, so it
 * works signed out too — only the options panel cares about the session.
 */
export default function Home() {
  const [leaders, setLeaders] = useState({});
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [optionsOpen, setOptionsOpen] = useState(false);
  const signedIn = api.isSignedIn();

  const loadLeaders = useCallback(async () => {
    setStatus('loading');
    try {
      let l = [];
      const rows = await api.getLeaderboard();
      l.push(rows);
      setLeaders(l);
      // setLeaders(rows.slice(0, MAX_ROWS));
      setStatus('ready');
    } catch (error) {
      console.warn('Could not load the leaderboard:', error.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadLeaders();
  }, [loadLeaders]);

  const signOut = () => {
    api.logout();
    navigate('/login', { replace: true });
  };

  return (
    <main className="home-screen" style={{ backgroundImage: `url(${background})` }}>
      <div className="home-column">
        <header className="home-hero">
          <p className="home-kicker">Global shipping tycoon</p>
          <h1>Ocean Builder</h1>
          <p className="home-tagline">
            Claim ports, build a fleet, and turn the world&apos;s trade routes into your own.
          </p>
        </header>

        <nav className="home-actions" aria-label="Main menu">
          <button type="button" className="home-play" onClick={() => navigate('/game')}>
            Play
          </button>
          <button type="button" className="home-secondary" disabled title="Coming later">
            Teams <span className="home-soon">coming later</span>
          </button>
          <button
            type="button"
            className="home-secondary"
            aria-expanded={optionsOpen}
            onClick={() => setOptionsOpen((open) => !open)}
          >
            Options
          </button>
        </nav>

        {optionsOpen && (
          <section className="home-options">
            {signedIn ? (
              <>
                <p className="home-note">Signed in as player {api.getPlayerId()}</p>
                <button type="button" className="home-link-btn" onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <p className="home-note">You are not signed in. Progress is only saved with an account.</p>
                <div className="home-options-links">
                  <Link to="/login">Log in</Link>
                  <Link to="/register">Create account</Link>
                </div>
              </>
            )}
          </section>
        )}

        <section className="home-scoreboard" aria-label="Top players">
          <div className="home-scoreboard-head">
            <h2>Score Board</h2>
            <button
              type="button"
              className="home-refresh"
              onClick={loadLeaders}
              disabled={status === 'loading'}
            >
              Refresh
            </button>
          </div>

          {status === 'loading' && <p className="home-note">Loading the rankings…</p>}

          {status === 'error' && (
            <p className="home-note home-note-error">The rankings are unavailable right now.</p>
          )}

          {status === 'ready' && leaders.length === 0 && (
            <p className="home-note">No companies have set sail yet. Be the first.</p>
          )}

          {status === 'ready' && leaders.length > 0 && (
            <ol className="home-leaders">
              {leaders.map((leader, index) => (
                <li className="home-leader" key={`${leader.user_name}-${index}`}>
                  <span className="home-rank">{index + 1}</span>
                  <span className="home-leader-name">{leader.user_name}</span>
                  <span className="home-leader-money">{formatMoney(leader.money)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
