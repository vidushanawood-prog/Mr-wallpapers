import React, { useState } from 'react';
import { X, Mail, UserCheck, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { signInWithPopup, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { BLUEPRINT_CONSTRAINTS } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  initialMode: 'signin' | 'register';
  onClose: () => void;
  currentUser: User | null;
  onAuthSuccess: (mode: 'signin' | 'register', email: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode,
  onClose,
  currentUser,
  onAuthSuccess,
}) => {
  const [mode, setMode] = useState<'signin' | 'register'>(initialMode);
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [emailInput, setEmailInput] = useState(currentUser?.email || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const syncUserToFirestore = async (
    firebaseUser: User,
    preferredName: string,
    accountMode: 'signin' | 'register'
  ) => {
    const cleanUid = firebaseUser.uid.slice(0, BLUEPRINT_CONSTRAINTS.MAX_ID_LENGTH);
    const cleanName = (
      preferredName.trim() ||
      firebaseUser.displayName ||
      firebaseUser.email?.split('@')[0] ||
      'MR Member'
    ).slice(0, BLUEPRINT_CONSTRAINTS.MAX_DISPLAY_NAME);
    const cleanEmail = (firebaseUser.email || emailInput.trim() || 'member@mrwallpapers.app').slice(
      0,
      BLUEPRINT_CONSTRAINTS.MAX_EMAIL
    );
    const isAdminEmail = cleanEmail.toLowerCase() === 'vidushanawood@gmail.com';

    const publicRef = doc(db, 'users', cleanUid);
    const privateRef = doc(db, 'user_private', cleanUid);

    try {
      const existingPublic = await getDoc(publicRef);
      if (!existingPublic.exists()) {
        await setDoc(publicRef, {
          uid: cleanUid,
          displayName: cleanName,
          role: isAdminEmail ? 'creator' : 'member',
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${cleanUid}`);
    }

    try {
      const existingPrivate = await getDoc(privateRef);
      if (!existingPrivate.exists()) {
        await setDoc(privateRef, {
          uid: cleanUid,
          email: cleanEmail,
          displayName: cleanName,
          accountType: accountMode,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `user_private/${cleanUid}`);
    }
  };

  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setIsSubmitting(true);

    try {
      let activeUser = auth.currentUser;
      if (!activeUser) {
        const result = await signInWithPopup(auth, googleProvider);
        activeUser = result.user;
      }

      if (activeUser) {
        await syncUserToFirestore(activeUser, displayName, mode);
        const savedEmail = activeUser.email || emailInput || 'Verified Account';
        setStatusMessage(
          mode === 'register'
            ? `Registered and stored ${savedEmail} in the MR Wallpapers member database.`
            : `Signed in as ${savedEmail}.`
        );
        onAuthSuccess(mode, savedEmail);
        setTimeout(() => {
          onClose();
        }, 900);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication could not be completed.';
      if (msg.includes('popup-closed-by-user')) {
        setErrorMessage('Sign-in popup was closed before completion. Please try again.');
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-[#0E0E11] border border-zinc-800 p-6 sm:p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800/70 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Segmented Mode Switcher */}
        <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg mb-6 w-fit">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setErrorMessage(null);
              setStatusMessage(null);
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              mode === 'signin'
                ? 'bg-[#E11D48] text-white'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMessage(null);
              setStatusMessage(null);
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              mode === 'register'
                ? 'bg-[#E11D48] text-white'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Register Account
          </button>
        </div>

        <h2
          id="auth-modal-title"
          className="font-display text-2xl font-bold tracking-tight text-white mb-2"
        >
          {mode === 'register' ? 'Create MR Wallpapers Account' : 'Welcome Back to MR Wallpapers'}
        </h2>
        <p className="text-sm text-zinc-400 mb-6">
          {mode === 'register'
            ? 'Register your email in our secure Firestore vault to save Pinterest boards and download >25MB studio master wallpapers.'
            : 'Sign in to access your saved wallpaper collections, custom display settings, and instant downloads.'}
        </p>

        <form onSubmit={handleAuthenticate} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Display Name
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={BLUEPRINT_CONSTRAINTS.MAX_DISPLAY_NAME}
                  placeholder="e.g. Vidusha"
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#E11D48] transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Email Address (Stored in Encrypted Member Vault)
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                maxLength={BLUEPRINT_CONSTRAINTS.MAX_EMAIL}
                placeholder="you@gmail.com"
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#E11D48] transition-colors"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-200">
              {errorMessage}
            </div>
          )}

          {statusMessage && (
            <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-800/60 text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{statusMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>
              {isSubmitting
                ? 'Verifying & Syncing Database...'
                : mode === 'register'
                ? 'Register & Verify with Google'
                : 'Sign In with Google'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-zinc-400" />
            Firestore Isolated PII Vault
          </span>
          <span>Curated by Vidusha</span>
        </div>
      </div>
    </div>
  );
};
