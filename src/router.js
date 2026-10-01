// Tiny history-API router.
//
// The app only has three screens (`/`, `/login`, `/register`), so a routing
// dependency is not worth it. Paths are real URLs rather than hashes so a link
// to /login keeps working when it is opened directly or shared.

import React from 'react';
import { useEffect, useState } from 'react';

export function currentPath() {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === '' ? '/' : path;
}

export function navigate(to, { replace = false } = {}) {
  if (currentPath() === to) return;

  if (replace) window.history.replaceState({}, '', to);
  else window.history.pushState({}, '', to);

  // Our own listener is the one that needs to hear about the change; a real
  // back/forward press fires this event for us.
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute() {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onChange = () => setPath(currentPath());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);

  return path;
}

// Anchor that routes client-side, but still renders a real href so it can be
// opened in a new tab. Modifier clicks are left to the browser.
export default function Link({ to, children, ...rest }) {
  const onClick = (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    navigate(to);
  };

  return (
    <a href={to} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}
