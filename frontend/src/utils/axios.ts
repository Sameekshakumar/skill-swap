import axios from 'axios';

// Create axios instance with custom config
// Use relative '/api' so Vite dev server proxy (configured in vite.config.js) can forward requests in dev
const instance = axios.create({
  baseURL: '/api',
  timeout: 10000, // Increased timeout
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add request interceptor
instance.interceptors.request.use(
  (config: any) => {
    const token = localStorage.getItem('token');
    if (token) {
      if (!config.headers) config.headers = {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: any) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle errors
instance.interceptors.response.use(
  (response: any) => response,
  (error: any) => {
    if (error?.response) {
      // Server responded with error status
      const data = error.response.data;
      const message = data?.error || data?.message || 'An error occurred';
      throw new Error(message);
    } else if (error?.request) {
      // Request was made but no response
      throw new Error('Network error - please check your connection');
    } else {
      // Error in request configuration
      throw new Error('Request failed - please try again');
    }
  }
);

export default instance;