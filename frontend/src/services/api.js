import axios from 'axios';
import { TOKEN_KEY } from '../constants';

export const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
});

axios.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export default axios;
