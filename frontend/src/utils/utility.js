/**
 * Utility adattata da AgID/spid-onboarding utility.js
 */

const DEBUG = process.env.NODE_ENV === 'development';

const Utility = {
  log(...args) {
    if (DEBUG) console.log('[SPID-APP]', ...args);
  },

  isValidURL(url) {
    if (!url || url.trim() === '') return false;
    try {
      const u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  },

  formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  },
};

export default Utility;
