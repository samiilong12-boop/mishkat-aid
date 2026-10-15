import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import { App } from './App';

// Register Offline-First Service Worker in production/supported browsers
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration optional in local dev
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
