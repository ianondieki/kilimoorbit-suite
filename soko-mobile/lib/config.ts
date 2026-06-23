/**
 * Single swap point for the backend (the KilimoOrbit Sentinel server, which
 * also serves the Soko marketplace API at /api/soko/*).
 * Set EXPO_PUBLIC_API_BASE in .env or edit the fallback below.
 * - Android emulator reaching your laptop:  http://10.0.2.2:4517
 * - Physical phone on the same Wi-Fi:       http://<your-laptop-LAN-IP>:4517
 * - Deployed (e.g. Render):                 https://kilimoorbit-sentinel.onrender.com
 */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? "http://192.168.100.46:4517";
