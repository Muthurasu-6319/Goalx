import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  User,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

export function getAuthErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code: string }).code);
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email or password. Please check your credentials and try again.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Try signing in instead.';
      case 'auth/weak-password':
        return 'Password is too weak. Use at least 6 characters.';
      case 'auth/requires-recent-login':
        return 'For security, please re-authenticate your session before completing this sensitive action.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/popup-closed-by-user':
        return 'Google sign-in popup was closed before completion.';
      case 'auth/popup-blocked':
        return 'Popup was blocked by your browser. Please allow popups for this site.';
      case 'auth/operation-not-allowed':
        return 'Email/Password sign-in is not yet enabled in Firebase Console. Use Google Sign-In or enable Email/Password under Authentication > Sign-in method.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please wait a moment and try again.';
      case 'auth/network-request-failed':
        return 'Network error. Check your internet connection and try again.';
      default:
        return (error as { message?: string }).message || 'Authentication failed. Please try again.';
    }
  }
  return error instanceof Error ? error.message : 'Authentication failed. Please try again.';
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function registerWithEmail(name: string, email: string, password: string): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: name.trim().slice(0, 120) });
  return credential.user;
}

export async function loginWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export function getUserProviderIds(): string[] {
  return auth.currentUser?.providerData?.map((p) => p.providerId).filter(Boolean) || [];
}

export async function getRecentAuthAgeSeconds(): Promise<number | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const result = await user.getIdTokenResult();
  const authTime = result.claims?.auth_time;
  if (typeof authTime === 'number') {
    return Math.max(0, Math.floor(Date.now() / 1000) - authTime);
  }
  return null;
}

export async function reauthenticateWithPassword(password: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('No email-based account is currently signed in.');
  }
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
  await user.getIdToken(true);
}

export async function reauthenticateWithGooglePopup(): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to re-authenticate.');
  }
  await reauthenticateWithPopup(user, googleProvider);
  await user.getIdToken(true);
}

export async function changeUserPassword(newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to change your password.');
  }
  await updatePassword(user, newPassword);
}
