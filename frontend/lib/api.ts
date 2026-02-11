import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    
    // Add tenant ID header if available
    const { user } = useAuthStore.getState();
    if (user?.tenantId) {
      config.headers['X-Tenant-ID'] = user.tenantId;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh token
        const response = await axios.post('/api/auth/refresh', {}, {
          withCredentials: true,
        });

        const { accessToken, user } = response.data;
        useAuthStore.getState().setAuth(user, accessToken);

        // Retry original request
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout
        useAuthStore.getState().logout();
        window.location.href = '/';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// Auth API
export const authApi = {
  login: (email: string, password: string, tenantId?: string) =>
    api.post('/auth/login', { email, password, tenantId }),
  
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    tenantId?: string;
  }) => api.post('/auth/register', data),
  
  logout: () => api.post('/auth/logout'),
  
  refresh: () => api.post('/auth/refresh'),
  
  me: () => api.get('/auth/me'),
  
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
};

// Dashboard API
export const dashboardApi = {
  getDashboard: (tenantId: string) =>
    api.get(`/dashboard/${tenantId}`),
  
  getTrend: (tenantId: string, months?: number) =>
    api.get(`/dashboard/trend/${tenantId}`, { params: { months } }),
  
  getCalendar: (tenantId: string, year: number, month: number) =>
    api.get(`/dashboard/calendar/${tenantId}`, { params: { year, month } }),
  
  getTopVendors: (tenantId: string, limit?: number) =>
    api.get(`/dashboard/vendors/${tenantId}`, { params: { limit } }),
};

// Subscriptions API
export const subscriptionsApi = {
  getAll: (params?: any) =>
    api.get('/subscriptions', { params }),
  
  getOne: (id: string) =>
    api.get(`/subscriptions/${id}`),
  
  create: (data: any) =>
    api.post('/subscriptions', data),
  
  update: (id: string, data: any) =>
    api.patch(`/subscriptions/${id}`, data),
  
  cancel: (id: string) =>
    api.post(`/subscriptions/${id}/cancel`),
  
  pause: (id: string) =>
    api.post(`/subscriptions/${id}/pause`),
  
  resume: (id: string) =>
    api.post(`/subscriptions/${id}/resume`),
  
  duplicate: (id: string) =>
    api.post(`/subscriptions/${id}/duplicate`),
  
  delete: (id: string) =>
    api.delete(`/subscriptions/${id}`),
  
  getUpcoming: (tenantId: string, days?: number) =>
    api.get(`/subscriptions/upcoming/${tenantId}`, { params: { days } }),
  
  getStats: (tenantId: string) =>
    api.get(`/subscriptions/stats/${tenantId}`),
  
  export: (tenantId: string) =>
    api.get(`/subscriptions/export/${tenantId}`, { responseType: 'blob' }),
};

// Tenants API
export const tenantsApi = {
  getAll: (params?: any) =>
    api.get('/tenants', { params }),
  
  getOne: (id: string) =>
    api.get(`/tenants/${id}`),
  
  create: (data: any) =>
    api.post('/tenants', data),
  
  update: (id: string, data: any) =>
    api.patch(`/tenants/${id}`, data),
  
  delete: (id: string) =>
    api.delete(`/tenants/${id}`),
  
  getStats: (id: string) =>
    api.get(`/tenants/${id}/stats`),
  
  getBranding: (slug: string) =>
    api.get(`/tenants/branding/${slug}`),
};

// Users API
export const usersApi = {
  getAll: (params?: any) =>
    api.get('/users', { params }),
  
  getOne: (id: string) =>
    api.get(`/users/${id}`),
  
  create: (data: any) =>
    api.post('/users', data),
  
  update: (id: string, data: any) =>
    api.patch(`/users/${id}`, data),
  
  delete: (id: string) =>
    api.delete(`/users/${id}`),
  
  invite: (data: any) =>
    api.post('/users/invite', data),
};

// Departments API
export const departmentsApi = {
  getAll: (params?: any) =>
    api.get('/departments', { params }),
  
  getByTenant: (tenantId: string) =>
    api.get(`/departments/by-tenant/${tenantId}`),
  
  getOne: (id: string) =>
    api.get(`/departments/${id}`),
  
  create: (data: any) =>
    api.post('/departments', data),
  
  update: (id: string, data: any) =>
    api.patch(`/departments/${id}`, data),
  
  delete: (id: string) =>
    api.delete(`/departments/${id}`),
};

// Alerts API
export const alertsApi = {
  getSettings: (tenantId: string) =>
    api.get(`/alerts/settings/${tenantId}`),
  
  updateSettings: (tenantId: string, data: any) =>
    api.patch(`/alerts/settings/${tenantId}`, data),
  
  getChannels: (tenantId: string) =>
    api.get(`/alerts/channels/${tenantId}`),
  
  createChannel: (data: any) =>
    api.post('/alerts/channels', data),
  
  updateChannel: (id: string, data: any) =>
    api.patch(`/alerts/channels/${id}`, data),
  
  deleteChannel: (id: string) =>
    api.delete(`/alerts/channels/${id}`),
  
  getLogs: (tenantId: string, page?: number, limit?: number) =>
    api.get(`/alerts/logs/${tenantId}`, { params: { page, limit } }),
};

// Audit API
export const auditApi = {
  getLogs: (params?: any) =>
    api.get('/audit', { params }),
  
  getEntityHistory: (entityType: string, entityId: string) =>
    api.get(`/audit/history/${entityType}/${entityId}`),
};

// Files API
export const filesApi = {
  upload: (file: File, subscriptionId: string, description?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('subscriptionId', subscriptionId);
    if (description) formData.append('description', description);
    
    return api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  
  getBySubscription: (subscriptionId: string) =>
    api.get(`/files/subscription/${subscriptionId}`),
  
  download: (id: string) =>
    api.get(`/files/${id}`, { responseType: 'blob' }),
  
  delete: (id: string) =>
    api.delete(`/files/${id}`),
};
