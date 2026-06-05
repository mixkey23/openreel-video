/**
 * Centralized API endpoint configuration.
 *
 * All external service URLs should be defined here so they can be
 * swapped for different environments or self-hosted instances.
 */

const isDev = import.meta.env.DEV;

/** OpenReel cloud services */
export const OPENREEL_CLOUD_URL = isDev
  ? "http://localhost:8787"
  : "https://openreel-cloud.niiyeboah1996.workers.dev";

/** OpenReel TTS service (Piper — external, kept as-is) */
export const OPENREEL_TTS_URL = "https://transcribe.openreel.video";

/**
 * Transcription endpoint — routed through Framesmith (local whisper-ctranslate2).
 * Always same-origin: no CORS, no Mixed Content, no cloud dependency.
 *
 * InspectorPanel appends "/transcribe" to this URL, producing:
 *   https://fsmith.teleanorco.com/api/transcribe
 * which maps to Framesmith's POST /api/transcribe router.
 */
export const OPENREEL_TRANSCRIBE_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/api`
    : "/api";

/**
 * Third-party API base URLs.
 * These are used by the api-proxy service in dev mode (direct calls)
 * and by the Cloudflare Pages Function proxy in production.
 * Application code should use apiFetch() from services/api-proxy.ts
 * instead of importing these directly.
 */
