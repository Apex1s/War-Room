import {
  bindFirebaseAuth,
  createFirebaseProvider,
  downloadDeviceModel,
  enableDefaultEgressGuard,
  initFirebaseRemoteConfig,
  installNetGuard,
  setCloudSyncFirestore,
  setProvider,
} from '@warroom/core';
import { App } from '@warroom/ui';
import '@warroom/ui/styles.css';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { initializeApp } from 'firebase/app';
import {
  CustomProvider,
  initializeAppCheck,
  type AppCheckToken,
} from 'firebase/app-check';
import { getAuth } from 'firebase/auth/web-extension';
import { getFirestore } from 'firebase/firestore';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

installNetGuard();
enableDefaultEgressGuard();

const BRIDGE_URL = 'https://war-room-hybrid.web.app/appcheck-bridge.html';
const BRIDGE_ORIGIN = 'https://war-room-hybrid.web.app';

interface ChromeStorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  remove(keys: string | string[]): Promise<void>;
}

interface ChromeStorageChange {
  newValue?: unknown;
  oldValue?: unknown;
}

interface ChromeGlobal {
  storage?: {
    session?: ChromeStorageArea;
    local?: ChromeStorageArea;
    onChanged?: {
      addListener(
        cb: (
          changes: Record<string, ChromeStorageChange>,
          areaName: string,
        ) => void,
      ): void;
      removeListener(
        cb: (
          changes: Record<string, ChromeStorageChange>,
          areaName: string,
        ) => void,
      ): void;
    };
  };
}

let bridgeIframe: HTMLIFrameElement | null = null;
let bridgeReadyPromise: Promise<HTMLIFrameElement> | null = null;

function ensureBridgeIframe(): Promise<HTMLIFrameElement> {
  if (bridgeReadyPromise) return bridgeReadyPromise;

  bridgeReadyPromise = new Promise<HTMLIFrameElement>((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.src = BRIDGE_URL;
    iframe.style.display = 'none';
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== BRIDGE_ORIGIN) return;
      const data = event.data as { type?: string } | null;
      if (data?.type === 'WARROOM_APPCHECK_BRIDGE_READY') {
        clearTimeout(timeoutId);
        window.removeEventListener('message', onMessage);
        resolve(iframe);
      }
    };

    const timeoutId = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      iframe.remove();
      bridgeIframe = null;
      bridgeReadyPromise = null;
      reject(new Error('App Check bridge iframe load timed out'));
    }, 10000);

    window.addEventListener('message', onMessage);
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

async function consumeInitialBrief(): Promise<string | null> {
  const chromeApi = (globalThis as { chrome?: ChromeGlobal }).chrome;
  const area = chromeApi?.storage?.session ?? chromeApi?.storage?.local;
  if (!area) return null;

  try {
    const res = await area.get('initialBrief');
    const text =
      typeof res.initialBrief === 'string' ? res.initialBrief.trim() : '';
    if (text.length > 0) {
      await area.remove(['initialBrief', 'initialBriefTs']);
      return text;
    }
  } catch {
    // Ignore chrome.storage errors
  }
  return null;
}

function subscribeInitialBrief(onBrief: (text: string) => void): () => void {
  const chromeApi = (globalThis as { chrome?: ChromeGlobal }).chrome;
  const onChanged = chromeApi?.storage?.onChanged;
  if (!onChanged) return () => {};

  const listener = (
    changes: Record<string, ChromeStorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'session' && areaName !== 'local') return;
    const change = changes.initialBrief;
    const nextVal =
      typeof change?.newValue === 'string' ? change.newValue.trim() : '';
    if (nextVal.length > 0) {
      const area =
        areaName === 'session'
          ? chromeApi.storage?.session
          : chromeApi.storage?.local;
      void area?.remove(['initialBrief', 'initialBriefTs']);
      onBrief(nextVal);
    }
  };

  onChanged.addListener(listener);
  return () => {
    onChanged.removeListener(listener);
  };
}

function bootstrapExtensionFirebase(): AI | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;

  if (!apiKey || !projectId || !appId) {
    return null;
  }

  const app = initializeApp({
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId,
  });

  initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: () => requestBridgeToken(),
    }),
    isTokenAutoRefreshEnabled: false,
  });

  const auth = getAuth(app);
  void bindFirebaseAuth(auth);

  setCloudSyncFirestore(getFirestore(app));
  void initFirebaseRemoteConfig(app);

  const ai = getAI(app, {
    backend: new GoogleAIBackend(),
    useLimitedUseAppCheckTokens: true,
  });

  setProvider(createFirebaseProvider(ai));
  return ai;
}

const aiInstance = bootstrapExtensionFirebase();

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App
        platform={{
          kind: 'extension',
          authMode: 'anonymous',
          onDownloadModel: aiInstance
            ? () => downloadDeviceModel(aiInstance)
            : undefined,
          initialBrief: consumeInitialBrief,
          subscribeInitialBrief,
        }}
      />
    </StrictMode>,
  );
}

export { bridgeIframe };
