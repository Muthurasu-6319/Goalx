import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export let storage: FirebaseStorage | null = null;
try {
  if (firebaseConfig.storageBucket) {
    storage = getStorage(app);
  }
} catch {
  storage = null;
}

// Conditional Firebase App Check initialization (only when a site key is configured)
const appCheckSiteKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_APP_CHECK_SITE_KEY) ||
  firebaseConfig.recaptchaSiteKey ||
  '';

if (typeof window !== 'undefined' && appCheckSiteKey.trim()) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey.trim()),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    // Ignore duplicate or unsupported environment initialization errors
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerIds?: string[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerIds:
        auth.currentUser?.providerData?.map((provider) => provider.providerId).filter(Boolean) || [],
    },
    operationType,
    path,
  };
  // Never log PII such as email addresses to the browser console
  console.error('Firestore Error:', errInfo.operationType, errInfo.path, errInfo.error);
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
