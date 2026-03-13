import axios from 'axios';

const BASE_URL = process.env.REACT_APP_GATEWAY_URL || 'http://localhost:8080';

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

// Request interceptor: aggiunge JWT
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('spid_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: gestisce 401
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('spid_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
