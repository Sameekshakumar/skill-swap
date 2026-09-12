import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from '../utils/axios'; // Use configured axios instance
import { clearToken, forgetMe, getToken, setToken as storeToken } from '../utils/session';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  // True until the saved token has been checked, so ProtectedRoute doesn't
  // redirect to /login before the session has had a chance to restore.
  loading: boolean;
  // The browser obtains this credential from Google; the server verifies it.
  loginWithGoogle: (credential: string, remember: boolean) => Promise<User>;
  logout: () => void;
  // Re-reads the profile so the navigation bar's credit count stays accurate
  // after a booking, cancellation or completion.
  refreshUser: () => Promise<void>;
}

interface User {
  id: string;
  name: string;
  email: string;
  creditBalance: number;
  college?: string;
  yearOfStudy?: string;
  avatarUrl?: string;
  profileComplete?: boolean;
}

interface LoginResponse {
  token: string;
  user: User;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// FIX 2: Reverted to 'export const' (named export) to match your App.tsx import
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isAuthenticated = Boolean(user && token);

  useEffect(() => {
    // Check for saved token on component mount
    const savedToken = getToken();
    if (!savedToken) {
      setLoading(false);
      return;
    }

    setToken(savedToken);
    // Get user profile instead of /auth/me
    axios.get('/profile', {
      headers: { Authorization: `Bearer ${savedToken}` }
    })
      .then((response: { data: User }) => {
        setUser(response.data);
      })
      .catch(() => {
        clearToken();
        setToken(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const loginWithGoogle = async (credential: string, remember: boolean) => {
    const response = await axios.post('/auth/google', { credential });
    const { user, token } = response?.data as LoginResponse;

    setUser(user);
    setToken(token);
    storeToken(token, remember);
    return user;
  };

  const refreshUser = async () => {
    try {
      const response = await axios.get('/profile');
      setUser(response.data as User);
    } catch {
      // A failed refresh should not sign the user out; the next call will retry.
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    clearToken();

    // Signing out has to stick. Without both of these, Google's automatic
    // sign-in hands the account straight back and logging out does nothing.
    forgetMe();
    (window as any).google?.accounts?.id?.disableAutoSelect?.();

    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, loading, loginWithGoogle, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// Removed the 'default export' line

