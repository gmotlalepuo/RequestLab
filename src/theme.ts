import { HttpMethod } from './types';

export const colors = {
  primary: '#FF6C37',
  primaryDark: '#E05320',
  primarySoft: '#FFF1EB',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#E6E6E6',
  borderStrong: '#D0D0D0',
  text: '#212121',
  textSecondary: '#6B6B6B',
  textMuted: '#9E9E9E',
  danger: '#D0021B',
  success: '#007F31',
  inputBackground: '#F5F5F5',
};

export const methodColors: Record<HttpMethod, string> = {
  GET: '#007F31',
  POST: '#AD7A03',
  PUT: '#0053B8',
  PATCH: '#623497',
  DELETE: '#8E1A10',
  HEAD: '#007F31',
  OPTIONS: '#A61468',
};

export const statusColor = (status: number): string => {
  if (status >= 200 && status < 300) return colors.success;
  if (status >= 300 && status < 400) return '#0053B8';
  if (status >= 400 && status < 500) return '#AD7A03';
  return colors.danger;
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};
