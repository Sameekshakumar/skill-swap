import { useEffect, useRef } from 'react';

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
  // Only offer to sign someone straight back in if they asked to be
  // remembered. After an explicit sign-out this is false, so logging out
  // sticks instead of bouncing them back into the app.
  autoSignIn: boolean;
}

// Google's script is loaded on demand and renders its own button into the div
// below. Loading it here rather than in index.html keeps it off pages that do
// not sign anyone in.
const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

const loadGoogleScript = () =>
  new Promise<void>((resolve, reject) => {
    // Already finished loading on an earlier mount.
    if ((window as any).google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existing) {
      // The tag is there but still downloading — React mounts effects twice in
      // development, and the second pass must wait rather than assume it is ready.
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not reach Google')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Could not reach Google')), { once: true });
    document.head.appendChild(script);
  });

export default function GoogleSignInButton({ onCredential, onError, autoSignIn }: GoogleSignInButtonProps) {
  const container = useRef<HTMLDivElement>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) {
      onError('Google sign-in is not configured yet. Add VITE_GOOGLE_CLIENT_ID to frontend/.env.');
      return;
    }

    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !container.current) return;

        const google = (window as any).google;
        google.accounts.id.initialize({
          client_id: clientId,
          auto_select: autoSignIn,
          callback: (response: { credential?: string }) => {
            if (response?.credential) onCredential(response.credential);
            else onError('Google did not return a sign-in token.');
          }
        });

        // One Tap only appears for people who chose to be remembered.
        if (autoSignIn) {
          google.accounts.id.prompt();
        } else {
          google.accounts.id.disableAutoSelect();
        }

        google.accounts.id.renderButton(container.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: 320
        });
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Google sign-in setup failed:', err);
          onError('Could not start Google sign-in. Check the browser console for details.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential, onError, autoSignIn]);

  return <div ref={container} className="google-button-slot" />;
}
