export const TOKEN_KEY = 'spid_token';
export const LS_KEY    = 'spid-pr-history';

export const API_BASE = process.env.REACT_APP_GATEWAY_URL || 'http://localhost:8080';

export const API = {
  files:          `${API_BASE}/api/files`,
  upload:         `${API_BASE}/api/files/upload`,
  fileContent:    (f) => `${API_BASE}/api/files/files/${encodeURIComponent(f)}/content`,
  fileValidate:   (f) => `${API_BASE}/api/files/files/${encodeURIComponent(f)}/validate`,
  deleteFiles:    `${API_BASE}/api/files/delete-xml-files`,
  validateGithub: `${API_BASE}/api/github/validate`,
  previewPR:      `${API_BASE}/api/pr/preview`,
  createPR:       `${API_BASE}/api/pr/create`,
  prStatus:       (n) => `${API_BASE}/api/pr/status/${n}`,
  login:          `${API_BASE}/api/auth/login`,
  changePassword: `${API_BASE}/api/auth/me/password`,
  users:          `${API_BASE}/api/users`,
  userById:       (id) => `${API_BASE}/api/users/${id}`,
  userResetPwd:   (id) => `${API_BASE}/api/users/${id}/reset-password`,
};
