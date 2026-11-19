import type { FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  activate,
  fetchAndActivate,
  getRemoteConfig,
  getValue,
  onConfigUpdate,
  type RemoteConfig,
} from 'firebase/remote-config';
import {
  DEFAULT_ROUTING_TABLE,
  RoutingTableSchema,
  updateRoutingTableFromJson,
  type RoutingTable,
} from '../ai/routing-table';
import { settingsStore } from '../storage/local-db';

export interface AuthUserState {
  uid: string | null;
  isAnonymous: boolean;
  email: string | null;
  displayName: string | null;
  ready: boolean;
}

let activeAuth: Auth | null = null;
let currentAuthState: AuthUserState = {
  uid: null,
  isAnonymous: true,
  email: null,
  displayName: null,
  ready: false,
};

const authListeners = new Set<(state: AuthUserState) => void>();

function notifyAuthListeners(): void {
  const snapshot = { ...currentAuthState };
  for (const listener of authListeners) {
    listener(snapshot);
  }
}

function userToState(user: User | null): AuthUserState {
  if (!user) {
    return {
      uid: null,
      isAnonymous: true,
      email: null,
      displayName: null,
      ready: true,
    };
  }
  return {
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    email: user.email,
    displayName: user.displayName,
    ready: true,
  };
}

export function getAuthUserState(): AuthUserState {
  return { ...currentAuthState };
}

export function subscribeAuthUserState(
  listener: (state: AuthUserState) => void,
): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

export function setAuthUserStateForTest(state: Partial<AuthUserState>): void {
  currentAuthState = {
    ...currentAuthState,
    ...state,
  };
  notifyAuthListeners();
}

/**
 * Binds a Firebase Auth instance (either `firebase/auth` on web or `firebase/auth/web-extension`
 * in the extension) and ensures anonymous sign-in runs at start without blocking offline mode.
 */
export async function bindFirebaseAuth(auth: Auth): Promise<AuthUserState> {
  activeAuth = auth;

  onAuthStateChanged(auth, (user) => {
    currentAuthState = userToState(user);
    notifyAuthListeners();
  });

  try {
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
    currentAuthState = userToState(auth.currentUser);
  } catch {
    currentAuthState = userToState(auth.currentUser);
  }

  notifyAuthListeners();
  return getAuthUserState();
}

/**
 * Upgrades an anonymous web user to Google sign-in via `linkWithPopup(GoogleAuthProvider)`
 * so their UID and saved games are preserved (design doc §5).
 * If the Google account was already linked earlier (`auth/credential-already-in-use`),
 * falls back to `signInWithPopup`.
 */
export async function signInWithGoogleWeb(auth?: Auth): Promise<AuthUserState> {
  const targetAuth = auth ?? activeAuth;
  if (!targetAuth) {
    throw new Error('Firebase Auth is not initialized.');
  }

  const provider = new GoogleAuthProvider();
  try {
    if (targetAuth.currentUser && targetAuth.currentUser.isAnonymous) {
      const cred = await linkWithPopup(targetAuth.currentUser, provider);
      currentAuthState = userToState(cred.user);
    } else {
      const cred = await signInWithPopup(targetAuth, provider);
      currentAuthState = userToState(cred.user);
    }
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (
      code === 'auth/credential-already-in-use' ||
      code === 'auth/email-already-in-use'
    ) {
      const cred = await signInWithPopup(targetAuth, provider);
      currentAuthState = userToState(cred.user);
    } else {
      throw err;
    }
  }

  notifyAuthListeners();
  return getAuthUserState();
}

/**
 * Applies a `routing_table` JSON string from Remote Config, clears the router's model cache
 * via `updateRoutingTableFromJson`, and caches the last valid JSON in IndexedDB for offline starts.
 */
export async function applyRemoteConfigRoutingTableJson(
  jsonString: string | null | undefined,
): Promise<RoutingTable> {
  const next = updateRoutingTableFromJson(jsonString);
  if (jsonString) {
    try {
      const raw: unknown = JSON.parse(jsonString);
      if (RoutingTableSchema.safeParse(raw).success) {
        await settingsStore.setLastGoodRoutingTableJson(jsonString);
      }
    } catch {
      // Ignore invalid JSON when caching
    }
  }
  return next;
}

/**
 * Initializes Firebase Remote Config for `routing_table`:
 * 1. Restores the last good `routing_table` from IndexedDB for offline starts.
 * 2. Sets compiled `DEFAULT_ROUTING_TABLE` as `defaultConfig`.
 * 3. Calls `fetchAndActivate` and applies `routing_table`.
 * 4. Subscribes to `onConfigUpdate` -> `activate` -> `applyRemoteConfigRoutingTableJson`,
 *    which clears the router's model cache live.
 */
export async function initFirebaseRemoteConfig(
  app: FirebaseApp,
): Promise<RemoteConfig | null> {
  try {
    const cachedJson = await settingsStore.getLastGoodRoutingTableJson();
    if (cachedJson) {
      updateRoutingTableFromJson(cachedJson);
    }
  } catch {
    // Ignore IndexedDB errors
  }

  try {
    const rc = getRemoteConfig(app);
    rc.defaultConfig = {
      routing_table: JSON.stringify(DEFAULT_ROUTING_TABLE),
    };

    try {
      await fetchAndActivate(rc);
      const liveJson = getValue(rc, 'routing_table').asString();
      if (liveJson) {
        await applyRemoteConfigRoutingTableJson(liveJson);
      }
    } catch {
      // Offline or fetch error: keep cached or compiled default routing table
    }

    try {
      onConfigUpdate(rc, {
        next: async () => {
          try {
            await activate(rc);
            const updatedJson = getValue(rc, 'routing_table').asString();
            await applyRemoteConfigRoutingTableJson(updatedJson);
          } catch {
            // Ignore live update activation failure
          }
        },
        error: () => {},
        complete: () => {},
      });
    } catch {
      // Realtime Remote Config listener may be unsupported in some environments
    }

    return rc;
  } catch {
    return null;
  }
}
