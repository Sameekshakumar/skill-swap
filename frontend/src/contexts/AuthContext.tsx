import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from '../utils/axios'; // Use configured axios instance

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  // True until the saved token has been checked, so ProtectedRoute doesn't
  // redirect to /login before the session has had a chance to restore.
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
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
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  college?: string;
  yearOfStudy?: string;
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
    const savedToken = localStorage.getItem('token');
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
        localStorage.removeItem('token');
        setToken(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

    const login = async (email: string, password: string) => {
    try {
  // FIX 3: Use correct endpoint path
  const response = await axios.post('/auth/login', { email, password });
  const { user, token } = response?.data as LoginResponse;
      setUser(user);
      setToken(token);
      // Store token in localStorage for persistence
      localStorage.setItem('token', token);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (userData: RegisterData) => {
    try {
  // FIX 4: Use correct endpoint path
  const response = await axios.post('/auth/register', userData);
  const { user, token } = response?.data as LoginResponse;
      setUser(user);
      setToken(token);
      // Store token in localStorage for persistence
      localStorage.setItem('token', token);
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
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
    localStorage.removeItem('token');
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

