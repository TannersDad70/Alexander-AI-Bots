/* ============================================================
 * Alexander Bots — app configuration.
 *
 * THIS IS THE ONE FILE you edit to rebrand or repoint the app.
 * Everything else reads from here: the web app, the download
 * page, the desktop wrapper and the mobile build.
 *
 * When you host this on your own server, set `downloadPageUrl`
 * to the public URL of the "Get the app" page (web/download/),
 * and `apkUrl` to the public URL of the built APK file.
 * ============================================================ */
/* Deployed from the business repository (TannersDad70/Alexander-AI-Bots). */
window.AB_CONFIG = {
  /* ---- Brand ---- */
  productName: "Alexander AI Solutions",
  productShort: "Alexander Bots",
  tagline: "AI coworkers you can hand real work to.",
  accent: "showcase", // "gold" | "azure" | "violet" | "showcase" — also switchable in Settings

  /* ---- Download / mobile ---- */
  // Public URL of the "Get the mobile app" page (web/download/index.html).
  // The QR code in the app header points here. Relative, so every deployment
  // resolves it against its own address (/app/download/).
  downloadPageUrl: "download/",
  // Direct link to the Android APK served from your host. Leave the
  // YOUR-HOST placeholder until an APK is published: the download page
  // hides its QR and says so rather than linking to a missing file.
  apkUrl: "https://YOUR-HOST/downloads/alexander-bots.apk",
  // Where desktop installers can be fetched (links on the download page).
  desktopDownloadUrl: "https://YOUR-HOST/downloads/",
  apkVersion: "1.0.0",

  /* ---- AI backend ---- */
  // Default model if the user never picks one. Any OpenRouter model id works.
  defaultModel: "deepseek/deepseek-v4.1-flash",
  openRouterModelsUrl: "https://openrouter.ai/api/v1/models",
  openRouterChatUrl: "https://openrouter.ai/api/v1/chat/completions",
  // Optional: point at your self-hosted OpenBot deployment to route chat
  // through your gateway. Leave empty to chat directly with OpenRouter.
  gatewayUrl: "",

  /* ---- Platform (bots, computers, activity) ----
   * Empty means "same origin" - which is what happens when this app is served
   * by a deployment at /app/. The Bots and Computer screens need that: the
   * platform's API is same-origin and shares the sign-in cookie. */
  apiBase: "",

  /* ---- Meta ---- */
  supportEmail: "jay.aais@hey.com",
  appVersion: "1.0.0",
  // Bumped by bin/deploy-app.sh on every deploy; Settings → App updates
  // compares it against version.json to spot a newer build.
  build: "2026-09-19.0002",
};
