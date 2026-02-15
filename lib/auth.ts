import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

export interface User {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  role: string;
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await api.post('/auth/login', { email, password });
  const { access_token, user } = response.data;

  await AsyncStorage.setItem('access_token', access_token);
  await AsyncStorage.setItem('user', JSON.stringify(user));

  return response.data;
}

export async function logout(): Promise<void> {
  await AsyncStorage.removeItem('access_token');
  await AsyncStorage.removeItem('user');
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('access_token');
}

export async function getUser(): Promise<User | null> {
  const userStr = await AsyncStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}
