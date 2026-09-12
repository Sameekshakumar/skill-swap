import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from '../utils/axios'; // Use configured axios instance

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => void;
}

interface User {
  id: string;
  name: string;
  email: string;
  creditBalance: number;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
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
  const isAuthenticated = Boolean(user && token);

  useEffect(() => {
    // Check for saved token on component mount
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      setToken(savedToken);
      // Get user profile instead of /auth/me
      axios.get('/profile', {
        headers: { Authorization: `Bearer ${savedToken}` }
      })
        .then(response => {
          setUser(response.data);
        })
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
        });
    }
  }, []);

    const login = async (email: string, password: string) => {
    try {
      console.log('Attempting login...');
  // FIX 3: Use correct endpoint path
  const response = await axios.post('/auth/login', { email, password });
  console.log('Login response:', response?.data);
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
      console.log('Attempting registration with:', userData);
  // FIX 4: Use correct endpoint path
  const response = await axios.post('/auth/register', userData);
  console.log('Registration response:', response?.data);
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

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, login, register, logout }}>
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

