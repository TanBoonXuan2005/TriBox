import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import appStyles from './App.css?inline';

(function () {
  // Idempotent: if a widget host is already mounted (double-injected script,
  // React StrictMode re-running an injection effect), don't mount a second one.
  if (document.getElementById('trinode-widget-host')) return;

  const currentScript =
    document.currentScript ||
    document.querySelector('script[data-api-key]');

  const apiKey = currentScript?.getAttribute('data-api-key') ?? '';

  // Derive the API origin from this script's own URL so the widget talks to the
  // host that served it: same-origin for a published /s/:slug page, the Tribox
  // host for an external embed. Falls back to the page origin — resolved purely
  // at runtime, never a baked-in build-time URL or hardcoded localhost.
  let apiBase;
  try {
    apiBase = new URL(currentScript.src, document.baseURI).origin;
  } catch {
    apiBase = window.location.origin;
  }

  const host = document.createElement('div');
  host.id = 'trinode-widget-host';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = appStyles;
  shadow.appendChild(style);

  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  const root = createRoot(mountPoint);
  root.render(<App apiKey={apiKey} apiBase={apiBase} />);
})();
