import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './constants';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
  timeout: 15000,
});

// Interceptor para agregar token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Retry interceptor for network errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    // Only retry on network errors or timeouts, not on HTTP errors (4xx, 5xx)
    const isNetworkError = !error.response && (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED' || error.message === 'Network Error');
    if (!isNetworkError || config._retryCount >= 3) {
      // NestJS returns message as array for validation errors - convert to string
      if (error?.response?.data?.message && Array.isArray(error.response.data.message)) {
        error.response.data.message = error.response.data.message.join(', ');
      }
      if (error?.message && Array.isArray(error.message)) {
        error.message = error.message.join(', ');
      }

      const isAuthRoute = config?.url?.startsWith('/auth/');
      if (error.response?.status === 401 && !isAuthRoute) {
        await AsyncStorage.removeItem('access_token');
        await AsyncStorage.removeItem('user');
      }
      return Promise.reject(error);
    }

    // Retry with exponential backoff
    config._retryCount = (config._retryCount || 0) + 1;
    const delay = Math.min(1000 * Math.pow(2, config._retryCount - 1), 8000);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return api(config);
  }
);

export default api;
