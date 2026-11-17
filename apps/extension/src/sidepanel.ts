import {
  createFirebaseProvider,
  enableDefaultEgressGuard,
  refreshDeviceAvailability,
  run,
  setProvider,
} from '@warroom/core';
import { describePlatform } from '@warroom/ui';
import { getAI, GoogleAIBackend } from 'firebase/ai';
import { initializeApp } from 'firebase/app';
import {
  CustomProvider,
  initializeAppCheck,
  type AppCheckToken,
} from 'firebase/app-check';
import { getAuth, signInAnonymously } from 'firebase/auth/web-extension';

const BRIDGE_URL = 'https://war-room-hybrid.web.app/appcheck-bridge.html';
const BRIDGE_ORIGIN = 'https://war-room-hybrid.web.app';

const titleEl = document.getElementById('ext-title');
const authEl = document.getElementById('ext-auth');
const appCheckEl = document.getElementById('ext-appcheck');
const nanoEl = document.getElementById('ext-nano');
const outputEl = document.getElementById('ext-output');
const btnBridgeTest = document.getElementById('btn-ext-bridge-test') as HTMLButtonElement | null;
const btnCloudCall = document.getElementById('btn-ext-cloud-call') as HTMLButtonElement | null;

if (titleEl) {
  titleEl.textContent = describePlatform({ kind: 'extension', authMode: 'anonymous' });
}

let bridgeIframe: HTMLIFrameElement | null = null;
let bridgeReadyPromise: Promise<HTMLIFrameElement> | null = null;

function ensureBridgeIframe(): Promise<HTMLIFrameElement> {
  if (bridgeReadyPromise) return bridgeReadyPromise;

  bridgeReadyPromise = new Promise<HTMLIFrameElement>((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.src = BRIDGE_URL;
    iframe.style.display = 'none';
    const timeoutId = setTimeout(() => {
      reject(new Error('App Check bridge iframe load timed out'));
    }, 10000);

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== BRIDGE_ORIGIN) return;
      const data = event.data as { type?: string } | null;
      if (data?.type === 'WARROOM_APPCHECK_BRIDGE_READY') {
        clearTimeout(timeoutId);
        window.removeEventListener('message', onMessage);
        resolve(iframe);
      }
    };

    window.addEventListener('message', onMessage);
    iframe.addEventListener('load', () => {
      clearTimeout(timeoutId);
      resolve(iframe);
    });
    document.body.appendChild(iframe);
    bridgeIframe = iframe;
  });

  return bridgeReadyPromise;
}

export async function requestBridgeToken(): Promise<AppCheckToken> {
  const iframe = await ensureBridgeIframe();
  const targetWindow = iframe.contentWindow;
  if (!targetWindow) {
    throw new Error('Bridge iframe contentWindow is null');
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise<AppCheckToken>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Timed out waiting for WARROOM_APPCHECK_RESPONSE from bridge'));
    }, 10000);

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== BRIDGE_ORIGIN) return;
      const data = event.data as {
        type?: string;
        requestId?: string;
        ok?: boolean;
        token?: string;
        expireTimeMillis?: number;
        error?: string;
      } | null;

      if (!data || data.type !== 'WARROOM_APPCHECK_RESPONSE' || data.requestId !== requestId) {
        return;
      }

      clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);

      if (data.ok && data.token && data.expireTimeMillis) {
        resolve({
          token: data.token,
          expireTimeMillis: data.expireTimeMillis,
        });
      } else {
        reject(new Error(data.error ?? 'Bridge token exchange failed'));
      }
    };

    window.addEventListener('message', onMessage);
    targetWindow.postMessage(
      { type: 'WARROOM_APPCHECK_REQUEST', requestId },
      BRIDGE_ORIGIN,
    );
  });
}

async function initSidePanel(): Promise<void> {
  const availability = await refreshDeviceAvailability();
  if (nanoEl) {
    nanoEl.textContent = `LanguageModel: ${availability}`;
  }

  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });

  const searchParams = new URLSearchParams(window.location.search);
  const usePlanB = searchParams.get('planB') === '1';

  // DEV only: a production build must never contain the debug token.
  if (import.meta.env.DEV && usePlanB && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  }

  initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: () => requestBridgeToken(),
    }),
    isTokenAutoRefreshEnabled: false,
  });

  if (appCheckEl) {
    appCheckEl.textContent = usePlanB
      ? 'App Check: Plan B (Debug Token)'
      : 'App Check: Plan A (Hosted Bridge CustomProvider)';
  }

  const auth = getAuth(app);
  try {
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
    if (authEl) {
      authEl.textContent = `Auth UID: ${auth.currentUser?.uid ?? 'signed-in'}`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (authEl) {
      authEl.textContent = `Auth error: ${msg}`;
    }
  }

  const ai = getAI(app, {
    backend: new GoogleAIBackend(),
    useLimitedUseAppCheckTokens: true,
  });

  setProvider(createFirebaseProvider(ai));
  enableDefaultEgressGuard();
}

btnBridgeTest?.addEventListener('click', async () => {
  if (!outputEl) return;
  outputEl.textContent = 'Requesting App Check token from hosted bridge (Plan A)…';
  const t0 = performance.now();
  try {
    const token = await requestBridgeToken();
    const elapsed = Math.round(performance.now() - t0);
    outputEl.textContent = JSON.stringify(
      {
        plan: 'Plan A (Bridge)',
        ok: true,
        latencyMs: elapsed,
        tokenPrefix: `${token.token.slice(0, 24)}…`,
        expireTimeMillis: token.expireTimeMillis,
      },
      null,
      2,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    outputEl.textContent = `Plan A Bridge error: ${msg}`;
  }
});

btnCloudCall?.addEventListener('click', async () => {
  if (!outputEl) return;
  outputEl.textContent = 'Running cloud call via @warroom/core router…';
  try {
    const res = await run('crowd', {
      situation:
        'A founder is about to commit to a startup plan and is testing it against investors, rivals and the market.',
      userHeadline:
        'Launch self-serve tier for [COMPANY_1] at [MONEY_1]/seat with a 14-day free trial.',
      generalHeadlines: [
        { name: 'Skeptical VC', headline: 'Pass on seed round.' },
      ],
      personas: [
        {
          id: 'p1',
          label: 'Busy team lead at a mid-size company',
          outlook: 'Would pay to save time.',
        },
      ],
    });
    outputEl.textContent = JSON.stringify(res, null, 2);
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    outputEl.textContent = `Cloud call error: ${msg}`;
  }
});

void initSidePanel();
export { bridgeIframe };
