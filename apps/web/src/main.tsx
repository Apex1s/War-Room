// Must run before Firebase: adds AbortSignal.any for older Safari.
import '@warroom/core/polyfills';
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
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

installNetGuard();
enableDefaultEgressGuard();

let aiInstance: AI | null = null;

function bootstrapFirebase(): AI | null {
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

  if (import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  }

  if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }

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

aiInstance = bootstrapFirebase();

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App
        platform={{
          kind: 'web',
          authMode: 'anonymous+google',
          onDownloadModel: aiInstance
            ? () => downloadDeviceModel(aiInstance)
            : undefined,
        }}
      />
    </StrictMode>,
  );
}
