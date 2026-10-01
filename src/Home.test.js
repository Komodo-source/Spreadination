import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Home, { formatMoney } from './Home';
import { clearSession } from './api';
import { currentPath } from './router';

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
});

describe('formatMoney', () => {
  it('shortens large sums the way the score board reads them', () => {
    expect(formatMoney(2500000000)).toBe('$2.5B');
    expect(formatMoney(1250000000000)).toBe('$1.3T');
    expect(formatMoney(800000)).toBe('$800K');
    expect(formatMoney(950)).toBe('$950');
  });
});

describe('home screen', () => {
  beforeEach(() => {
    clearSession();
    window.history.replaceState({}, '', '/');
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        leaderboard: [
          { user_name: 'BlueWave', money: 1200000 },
          { user_name: 'OceanCorp', money: 2500000000 },
        ],
      })
    );
  });

  afterEach(() => {
    clearSession();
  });

  it('shows the top companies richest first', async () => {
    render(<Home />);

    await screen.findByText('OceanCorp');

    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('OceanCorp');
    expect(rows[0]).toHaveTextContent('$2.5B');
    expect(rows[1]).toHaveTextContent('BlueWave');
  });

  it('starts the game from the Play button', async () => {
    render(<Home />);

    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));

    expect(currentPath()).toBe('/game');
  });

  it('says the rankings are unavailable rather than hanging when the server is down', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    render(<Home />);

    await screen.findByText(/rankings are unavailable/i);
  });
});
