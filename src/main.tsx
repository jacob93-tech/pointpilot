import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { App } from './App';
import { ensureSeeded, requestPersistentStorage } from './lib/db';

async function boot() {
  try {
    await ensureSeeded();
    void requestPersistentStorage();
  } catch (e) {
    console.error('Storage unavailable', e);
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void boot();
