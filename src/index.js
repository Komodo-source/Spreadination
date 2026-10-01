import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import Login from './Login';
import Register from './register.js';
import reportWebVitals from './reportWebVitals';
import { useRoute } from './router';
import Home from './Home';
import UI from './UI';

// `/` is the home screen: Play, the stubs and the world ranking. The game itself lives
// at `/game`, so closing the tab on a session and coming back lands on the menu rather
// than straight into an in-progress map.
function Root() {
  switch (useRoute()) {
    case '/login':
      return <Login />;
    case '/register':
      return <Register />;
    case '/game':
      return <UI />;
    default:
      return <Home />;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
