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
  login: (email: string, password: string, remember: boolean) => Promise<User>;
  register: (details: RegisterDetails, remember: boolean) => Promise<User>;
  logout: () => void;
  // Re-reads the profile so the navigation bar's credit count stays accurate
  // after a booking, cancellation or completion.
  refreshUser: () => Promise<void>;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
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

interface RegisterDetails {
  name: string;
  email: string;
  password: string;
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

  // Both endpoints return the same { token, user } shape, so one helper
  // finishes the job for either.
  const startSession = (data: LoginResponse, remember: boolean) => {
    setUser(data.user);
    setToken(data.token);
    storeToken(data.token, remember);
    return data.user;
  };

  const login = async (email: string, password: string, remember: boolean) => {
    const response = await axios.post('/auth/login', { email, password });
    return startSession(response.data as LoginResponse, remember);
  };

  const register = async (details: RegisterDetails, remember: boolean) => {
    const response = await axios.post('/auth/register', details);
    return startSession(response.data as LoginResponse, remember);
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

    // Signing out has to stick: clear the token from both stores and turn off
    // "keep me signed in", so the next visit starts at the login form.
    forgetMe();

    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, loading, login, register, logout, refreshUser }}>
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

