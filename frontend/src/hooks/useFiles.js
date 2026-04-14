import { useState, useCallback } from 'react';
import axios, { getAuthHeaders } from '../services/api';
import { API, API_BASE } from '../constants';
import { notify } from '../services/notificationService';

const ensureSet = (v) => {
  if (v instanceof Set) return v;
  if (Array.isArray(v)) return new Set(v);
  return new Set();
};

export function useFiles() {
  const [files,               setFiles]               = useState([]);
  const [validating,          setValidating]           = useState(() => new Set());
  const [certificateLoading,  setCertificateLoading]   = useState(() => new Set());
  const [registryCache,       setRegistryCache]        = useState({});
  const [certificateCache,    setCertificateCache]     = useState({});

  // ── Validazione XML ──────────────────────────────────
  const loadValidation = useCallback(async (filename) => {
    setValidating(prev => { const s = ensureSet(prev); s.add(filename); return new Set(s); });
    try {
      const res = await axios.get(API.fileValidate(filename), getAuthHeaders());
      setFiles(prev =>
        Array.isArray(prev)
          ? prev.map(f => f.filename === filename ? { ...f, validation: res.data } : f)
          : []
      );
      return res.data;
    } catch {
      const fallback = { errors: [], warnings: [] };
      setFiles(prev =>
        Array.isArray(prev)
          ? prev.map(f => f.filename === filename ? { ...f, validation: fallback } : f)
          : []
      );
      return fallback;
    } finally {
      setValidating(prev => { const s = ensureSet(prev); s.delete(filename); return new Set(s); });
    }
  }, []);

  // ── Registry SPID ────────────────────────────────────
  const loadRegistryData = useCallback(async (entityID) => {
    try {
      const res  = await axios.get(
        `https://registry.spid.gov.it/entities-sp/${encodeURIComponent(entityID)}?output=json`
      );
      const data = {
        exists:         true,
        createDate:     res.data.create_date     || null,
        lastUpdateDate: res.data.lastupdate_date || null,
        registry_link:  res.data.registry_link   || `https://registry.spid.gov.it/entities-sp/${encodeURIComponent(entityID)}`,
        raw:            res.data,
      };
      setRegistryCache(prev => ({ ...prev, [entityID]: data }));
      return data;
    } catch (err) {
      const data = err.response?.status === 404 ? { exists: false } : { exists: false, error: true };
      setRegistryCache(prev => ({ ...prev, [entityID]: data }));
      return data;
    }
  }, []);

  // ── Verifica certificato ─────────────────────────────
  const loadCertificateData = useCallback(async (entityId, fileObj = null) => {
    if (!entityId) return;

    const cacheKey = fileObj?.filename
      ? `${fileObj.filename}::${entityId}`
      : entityId;

    setCertificateLoading(prev => { const s = ensureSet(prev); s.add(entityId); return new Set(s); });

    try {
      let xmlContent = null;
      if (fileObj?.filename) {
        try {
          const xmlRes = await axios.post(
            `${API_BASE}/api/files/get-xml-contents`,
            { filenames: [fileObj.filename] },
            getAuthHeaders()
          );
          xmlContent = Array.isArray(xmlRes.data) ? xmlRes.data[0]?.content : null;
        } catch { /* fallback a registry */ }
      }

      const res = await axios.post(
        `${API_BASE}/api/certificates/verify`,
        xmlContent ? { entityId, xmlContent } : { entityId },
        getAuthHeaders()
      );

      setCertificateCache(prev => ({
        ...(typeof prev === 'object' ? prev : {}),
        [cacheKey]: res.data,
      }));

      // Se certificato non valido → inietta errori in file.validation
      if (!res.data.valid) {
        const certErrors = (res.data.errors || []).map(e => ({
          testId:  'CERT_INVALID',
          message: e,
          source:  'certificate',
        }));
        const targetFilename = fileObj?.filename;
        if (targetFilename) {
          setFiles(prev =>
            Array.isArray(prev)
              ? prev.map(f => {
                  if (f.filename !== targetFilename) return f;
                  const existing = f.validation || { errors: [], warnings: [] };
                  if (existing.errors.some(e => e.source === 'certificate')) return f;
                  return {
                    ...f,
                    validation: {
                      ...existing,
                      errors: [...existing.errors, ...certErrors],
                    },
                  };
                })
              : prev
          );
        }
      }

      return res.data;
    } catch (err) {
      const data = {
        valid: false,
        error: err.response?.data?.error || err.message || 'Errore verifica certificato',
      };
      setCertificateCache(prev => ({
        ...(typeof prev === 'object' ? prev : {}),
        [cacheKey]: data,
      }));
      return data;
    } finally {
      setCertificateLoading(prev => { const s = ensureSet(prev); s.delete(entityId); return new Set(s); });
    }
  }, []);

  // ── Caricamento lista file ───────────────────────────
  const loadFiles = useCallback(async () => {
    try {
      const res      = await axios.get(API.files, getAuthHeaders());
      const fileList = Array.isArray(res.data) ? res.data : [];
      setFiles(fileList);
      fileList.forEach(file => {
        loadValidation(file.filename);
        if (file.entityID) loadCertificateData(file.entityID, file);
      });
    } catch {
      notify.error('Errore nel caricamento dei file');
    }
  }, [loadValidation, loadCertificateData]);

  return {
    files, setFiles,
    validating, ensureSet,
    certificateLoading,
    registryCache,
    certificateCache,
    loadFiles,
    loadValidation,
    loadRegistryData,
    loadCertificateData,
  };
}
