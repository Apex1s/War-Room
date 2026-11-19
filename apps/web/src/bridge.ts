import { initializeApp } from 'firebase/app';
import {
  getLimitedUseToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';

const ALLOWED_EXTENSION_ORIGIN = 'chrome-extension://mgiolmlgmbopkehpakjhcmiggeipclgf';

function isAllowedOrigin(origin: string): boolean {
  if (origin === ALLOWED_EXTENSION_ORIGIN || origin === window.location.origin) return true;
  // Local origins only in dev builds: in production any local page could mint App Check tokens.
  return (
    import.meta.env.DEV &&
    (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))
  );
}

let appCheckInstance: AppCheck | null = null;
let initError: string | null = null;

try {
  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });

  appCheckInstance = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: false,
  });
} catch (err) {
  initError = err instanceof Error ? err.message : String(err);
}

window.addEventListener('message', async (event: MessageEvent) => {
  if (!isAllowedOrigin(event.origin)) return;
  const data = event.data as { type?: string; requestId?: string } | null;
  if (!data || data.type !== 'WARROOM_APPCHECK_REQUEST' || !data.requestId) return;

  const target = event.source as WindowProxy | null;
  if (!target) return;

  if (!appCheckInstance || initError) {
    target.postMessage(
      {
        type: 'WARROOM_APPCHECK_RESPONSE',
        requestId: data.requestId,
        ok: false,
        error: initError ?? 'App Check bridge not initialised',
      },
      event.origin,
    );
    return;
  }

  try {
    const res = await getLimitedUseToken(appCheckInstance);
    target.postMessage(
      {
        type: 'WARROOM_APPCHECK_RESPONSE',
        requestId: data.requestId,
        ok: true,
        token: res.token,
        expireTimeMillis: Date.now() + 55 * 60 * 1000,
      },
      event.origin,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    target.postMessage(
      {
        type: 'WARROOM_APPCHECK_RESPONSE',
        requestId: data.requestId,
        ok: false,
        error: msg,
      },
      event.origin,
    );
  }
});

if (window.parent && window.parent !== window) {
  window.parent.postMessage({ type: 'WARROOM_APPCHECK_BRIDGE_READY' }, '*');
}
