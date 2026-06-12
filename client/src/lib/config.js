// Base URL for backend API calls.
//
// Empty default = same-origin. This works in three setups without code changes:
//   1. Dev: Vite (port 5173) proxies /api, /s/, /widget.js to the backend.
//   2. Single-origin prod: Express serves the built client AND /api from one host.
//   3. Split prod with a Vercel rewrite that proxies /api/* to the Render backend.
//
// Only set VITE_API_URL when the frontend talks directly (cross-origin) to a
// backend on a different domain, e.g. https://<render-app>.onrender.com. In that
// case prefix fetches with API_BASE and ensure the backend's CORS allows the
// frontend origin (APP_URL on the server).
export const API_BASE = import.meta.env.VITE_API_URL || '';
