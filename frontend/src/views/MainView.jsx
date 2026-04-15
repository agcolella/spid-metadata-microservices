import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { notify } from '../services/notificationService';
import { PRPreviewModal } from '../components/PRPreviewModal';
import { ProgressTracker } from '../components/ProgressTracker';
import { ValidationBadge } from '../components/ValidationBadge';
import UserManagementPage from './UserManagementView';

const API_BASE  = process.env.REACT_APP_GATEWAY_URL || 'http://localhost:8080';
const TOKEN_KEY = 'spid_token';
const LS_KEY    = 'spid-pr-history';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
});

const API = {
  files:          `${API_BASE}/api/files/files`,
  upload:         `${API_BASE}/api/files/upload`,
  fileValidate:   (f) => `${API_BASE}/api/files/files/${encodeURIComponent(f)}/validate`,
  deleteFiles:    `${API_BASE}/api/files/delete-xml-files`,
  validateGithub: `${API_BASE}/api/github/validate`,
  previewPR:      `${API_BASE}/api/pr/preview`,
  createPR:       `${API_BASE}/api/pr/create`,
};

function getUserRole() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || null;
  } catch { return null; }
}

const ensureSet = (v) => {
  if (v instanceof Set) return v;
  if (Array.isArray(v)) return new Set(v);
  return new Set();
};

// ─────────────────────────────────────────────────────────────
export default function MainView() {
  const [files,              setFiles]             = useState([]);
  const [validating,         setValidating]         = useState(() => new Set());
  const [certificateLoading, setCertificateLoading] = useState(() => new Set());
  const [selectedFiles,      setSelectedFiles]      = useState([]);
  const [search,             setSearch]             = useState('');
  const [sortConfig,         setSortConfig]         = useState({ key: 'creationDate', direction: 'desc' });
  const [uploadProgress,     setUploadProgress]     = useState({ loaded: 0, total: 0, active: false });
  const [uploadErrors,       setUploadErrors]       = useState([]);
  const [registryCache,      setRegistryCache]      = useState({});
  const [certificateCache,   setCertificateCache]   = useState({});
  const [resultsPerPage,     setResultsPerPage]     = useState(10);
  const [page,               setPage]               = useState(1);
  const [pullRequests,       setPullRequests]       = useState([]);
  const [prPreview,          setPrPreview]          = useState(null);
  const [prInProgress,       setPrInProgress]       = useState(false);
  const [prStep,             setPrStep]             = useState(0);
  const [githubValid,        setGithubValid]        = useState(null);
  const [expandedRows,       setExpandedRows]       = useState([]);
  const [errorFilterMode] = useState('all');
  const [xmlModalContent,    setXmlModalContent]    = useState(null);
  const [sectionsCollapsed,  setSectionsCollapsed]  = useState({ upload: false, files: false });
  const [validFilesForPR,    setValidFilesForPR]    = useState([]);
  const [activePage,         setActivePage]         = useState('main');

  const userRole     = getUserRole();
  const fileInputRef = useRef();
  const dirInputRef  = useRef();
  const prSteps = ['Validazione', 'Creazione Branch', 'Upload File', 'Creazione Commit', 'Apertura PR'];

  // ── bootstrap ──────────────────────────────────────────────
  useEffect(() => {
    loadFiles();
    validateGitHub();
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { try { setPullRequests(JSON.parse(raw)); } catch { setPullRequests([]); } }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSection = (s) =>
    setSectionsCollapsed(prev => ({ ...prev, [s]: !prev[s] }));

  // ── data loaders ───────────────────────────────────────────
  const loadFiles = async () => {
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
  };

  const loadValidation = async (filename) => {
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
  };

  const loadRegistryData = async (entityID) => {
    if (registryCache[entityID]) return registryCache[entityID];
    try {
      const res  = await axios.get(
        `https://registry.spid.gov.it/entities-sp/${encodeURIComponent(entityID)}?output=json`
      );
      const data = {
        exists:         true,
        createDate:     res.data.create_date     || null,
        lastUpdateDate: res.data.lastupdate_date || null,
        registry_link:  res.data.registry_link   ||
          `https://registry.spid.gov.it/entities-sp/${encodeURIComponent(entityID)}`,
        raw: res.data,
      };
      setRegistryCache(prev => ({ ...prev, [entityID]: data }));
      return data;
    } catch (err) {
      const data = err.response?.status === 404 ? { exists: false } : { exists: false, error: true };
      setRegistryCache(prev => ({ ...prev, [entityID]: data }));
      return data;
    }
  };

  const loadCertificateData = async (entityId, fileObj = null) => {
    if (!entityId) return;
    const file     = fileObj || files.find(f => f.entityID === entityId);
    const cacheKey = file?.filename ? `${file.filename}::${entityId}` : entityId;

    setCertificateLoading(prev => { const s = ensureSet(prev); s.add(entityId); return new Set(s); });
    try {
      let xmlContent = null;
      if (file?.filename) {
        try {
          const xmlRes = await axios.post(
            `${API_BASE}/api/files/get-xml-contents`,
            { filenames: [file.filename] },
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

      if (!res.data.valid) {
        const certErrors = (res.data.errors || []).map(e => ({
          testId: 'CERT_INVALID', message: e, source: 'certificate',
        }));
        const targetFilename = file?.filename;
        if (targetFilename) {
          setFiles(prev =>
            Array.isArray(prev)
              ? prev.map(f => {
                  if (f.filename !== targetFilename) return f;
                  const existing = f.validation || { errors: [], warnings: [] };
                  if (existing.errors.some(e => e.source === 'certificate')) return f;
                  return { ...f, validation: { ...existing, errors: [...existing.errors, ...certErrors] } };
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
  };

  const validateGitHub = async () => {
    try {
      const res = await axios.get(API.validateGithub, getAuthHeaders());
      setGithubValid(res.data.valid);
      if (!res.data.valid) notify.warning('GitHub non configurato correttamente');
    } catch { setGithubValid(false); }
  };

  // ── upload ─────────────────────────────────────────────────
  const handleUpload = async (e) => {
    const allFiles  = Array.from(e.target.files);
    if (allFiles.length === 0) return;
    const xmlFiles  = allFiles.filter(f => f.name.toLowerCase().endsWith('.xml'));
    const discarded = allFiles.length - xmlFiles.length;
    if (xmlFiles.length === 0) { notify.warning('Nessun file XML selezionato'); e.target.value = null; return; }
    if (discarded > 0) notify.warning(`${discarded} file non XML ignorati`);
    setUploadProgress({ loaded: 0, total: xmlFiles.length, active: true });
    setUploadErrors([]);
    const errors = [];
    for (let i = 0; i < xmlFiles.length; i++) {
      const fd = new FormData();
      fd.append('xmlFile', xmlFiles[i]);
      try {
        await axios.post(API.upload, fd, {
          headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
        });
        setUploadProgress(prev => ({ ...prev, loaded: i + 1 }));
      } catch (err) {
        errors.push({ filename: xmlFiles[i].name, error: err.response?.data?.error || err.message });
      }
    }
    setUploadProgress({ loaded: 0, total: 0, active: false });
    if (errors.length > 0) { setUploadErrors(errors); notify.error(`${errors.length} file con errori`); }
    else notify.success(`${xmlFiles.length} file caricati con successo!`);
    await loadFiles();
    e.target.value = null;
  };

  // ── selezione ──────────────────────────────────────────────
  const toggleFileSelection = (fn) => {
    const isSelected = selectedFiles.includes(fn);
    setSelectedFiles(prev => isSelected ? prev.filter(f => f !== fn) : [...prev, fn]);
    if (!isSelected) loadValidation(fn);
  };

  const sidebarFiles = files.filter(f => {
    const hasErrors = f.validation?.errors?.length > 0;
    if (errorFilterMode === 'onlyErrors') return hasErrors;
    if (errorFilterMode === 'noErrors')   return !hasErrors;
    return true;
  });

  const selectAll   = () => {
    const fns = sidebarFiles.map(f => f.filename);
    setSelectedFiles(fns);
    fns.forEach(fn => loadValidation(fn));
  };
  const deselectAll = () => setSelectedFiles([]);

  const deleteSelected = async () => {
    if (!window.confirm(`Eliminare ${selectedFiles.length} file?`)) return;
    try {
      await axios.post(API.deleteFiles, { filenames: selectedFiles }, getAuthHeaders());
      notify.success(`${selectedFiles.length} file eliminati`);
      setSelectedFiles([]);
      await loadFiles();
    } catch { notify.error('Errore eliminazione file'); }
  };

  // ── PR ─────────────────────────────────────────────────────
  const openPRPreview = async () => {
    if (selectedFiles.length === 0) { notify.warning('Seleziona almeno un file'); return; }
    const validFiles = selectedFiles.filter(fn => {
      const f = files.find(x => x.filename === fn);
      return f?.validation && f.validation.errors?.length === 0;
    });
    if (validFiles.length === 0) { notify.error('Nessun file valido (tutti hanno errori di validazione)'); return; }
    if (validFiles.length < selectedFiles.length)
      notify.warning(`${selectedFiles.length - validFiles.length} file con errori esclusi dalla PR`);
    try {
      const res = await axios.post(API.previewPR, { files: validFiles }, getAuthHeaders());
      setPrPreview(res.data);
      setValidFilesForPR(validFiles);
    } catch (err) { notify.error('Errore anteprima PR: ' + (err.response?.data?.error || err.message)); }
  };

  const confirmCreatePR = async () => {
    setPrInProgress(true); setPrStep(0);
    try {
      const res = await axios.post(
        API.createPR,
        { files: validFilesForPR, organizations: prPreview.organizations, draft: false },
        getAuthHeaders()
      );
      if (res.data.success) {
        notify.success('PR creata con successo!');
        const newPR = {
          id:            Date.now(),
          number:        res.data.number,
          url:           res.data.url,
          branch:        res.data.branch,
          organizations: prPreview.organizations,
          fileCount:     validFilesForPR.length,
          createdAt:     new Date().toISOString(),
          status:        'open',
        };
        const updated = [newPR, ...pullRequests];
        setPullRequests(updated);
        localStorage.setItem(LS_KEY, JSON.stringify(updated));
        setSelectedFiles([]); setValidFilesForPR([]); setPrPreview(null);
        await loadFiles();
      }
    } catch (err) { notify.error('Errore creazione PR: ' + (err.response?.data?.error || err.message)); }
    finally { setPrInProgress(false); setPrStep(0); }
  };

  // ── tabella ────────────────────────────────────────────────
  const toggleRowExpansion = async (filename) => {
    const safeRows = Array.isArray(expandedRows) ? expandedRows : [];
    if (safeRows.includes(filename)) {
      setExpandedRows(prev => (Array.isArray(prev) ? prev.filter(f => f !== filename) : []));
      return;
    }
    setExpandedRows(prev => (Array.isArray(prev) ? [...prev, filename] : [filename]));
    const file = files.find(f => f.filename === filename);
    if (file?.entityID && !registryCache[file.entityID]) loadRegistryData(file.entityID);
    if (file?.entityID) loadCertificateData(file.entityID, file);
    loadValidation(filename);
  };

  const handleSort = (key) =>
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));

  const handleViewXml = async (filename) => {
    try {
      const res     = await axios.post(
        `${API_BASE}/api/files/get-xml-contents`,
        { filenames: [filename] },
        getAuthHeaders()
      );
      const content = Array.isArray(res.data) ? res.data[0]?.content : res.data?.content;
      setXmlModalContent({ filename, content: content || '' });
    } catch { notify.error('Errore nel caricamento del contenuto XML'); }
  };

  // ── derivati ───────────────────────────────────────────────
  const selectedFileObjects = files.filter(f => selectedFiles.includes(f.filename));
  const filteredFiles = selectedFileObjects.filter(f =>
    f.filename.toLowerCase().includes(search.toLowerCase()) ||
    (f.entityID         || '').toLowerCase().includes(search.toLowerCase()) ||
    (f.organizationName || '').toLowerCase().includes(search.toLowerCase())
  );
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    if (sortConfig.key === 'creationDate')
      return (new Date(a.creationDate) - new Date(b.creationDate)) * dir;
    return ((a[sortConfig.key] || '').localeCompare(b[sortConfig.key] || '')) * dir;
  });
  const totalPages     = Math.ceil(sortedFiles.length / resultsPerPage);
  const paginatedFiles = sortedFiles.slice((page - 1) * resultsPerPage, page * resultsPerPage);

  // ── stili condivisi ────────────────────────────────────────
  const S = {
    page:    { display: 'flex', minHeight: '100vh', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#f8fafc' },
    sidebar: { width: 290, minHeight: '100vh', background: '#1e293b', color: '#f1f5f9', display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflowY: 'auto', flexShrink: 0 },
    main:    { flex: 1, padding: 24, overflowY: 'auto', minWidth: 0 },
    card:    { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)', marginBottom: 16 },
    btn:     (bg = '#3b82f6', c = '#fff') => ({ background: bg, color: c, border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }),
    th:      (extra = {}) => ({ padding: '10px 12px', background: '#f1f5f9', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600, ...extra }),
    td:      { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' },
    sortTh:  (key) => ({ padding: '10px 12px', background: '#f1f5f9', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }),
  };

  const sortArrow = (key) => sortConfig.key === key ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : '';

  // ══════════════════════════════════════════════════════════
  return (
    <div style={S.page}>

      {/* ─── SIDEBAR ──────────────────────────────────────── */}
      <div style={S.sidebar}>
        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>📁 SPID Metadata</div>

        {/* Navigazione */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          {[
            { id: 'main',  label: '🏠 Dashboard' },
            ...(userRole === 'admin' ? [{ id: 'users', label: '👥 Gestione Utenti' }] : []),
          ].map(({ id, label }) => (
            <button key={id} onClick={() => setActivePage(id)}
              style={{
                background: activePage === id ? '#3b82f6' : 'transparent',
                color: '#f1f5f9', border: 'none', borderRadius: 6,
                padding: '8px 10px', cursor: 'pointer', textAlign: 'left',
                fontSize: '0.85rem', fontWeight: activePage === id ? 700 : 400,
              }}>
              {label}
            </button>
          ))}
        </div>

        {githubValid === false && (
          <div style={{ background: '#7f1d1d', borderRadius: 6, padding: '8px 10px', fontSize: '0.8rem' }}>
            ⚠️ GitHub non configurato
          </div>
        )}

        {/* Upload */}
        <div style={{ borderBottom: '1px solid #334155', paddingBottom: 12 }}>
          <div
            style={{ fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => toggleSection('upload')}
          >
            <span>📤 Upload{uploadProgress.active && ` (${uploadProgress.loaded}/${uploadProgress.total})`}</span>
            <span>{sectionsCollapsed.upload ? '▶' : '▼'}</span>
          </div>
          {!sectionsCollapsed.upload && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input type="file" ref={fileInputRef} multiple accept=".xml" style={{ display: 'none' }} onChange={handleUpload} />
              <input type="file" ref={dirInputRef}  multiple accept=".xml" style={{ display: 'none' }} onChange={handleUpload} webkitdirectory="true" />
              <button style={S.btn()} onClick={() => fileInputRef.current.click()} disabled={uploadProgress.active}>
                📁 Scegli File
              </button>
              <button style={S.btn('#475569')} onClick={() => dirInputRef.current.click()} disabled={uploadProgress.active}>
                📂 Scegli Cartella
              </button>
              {uploadProgress.active && (
                <div style={{ background: '#334155', borderRadius: 6, height: 6 }}>
                  <div style={{
                    background: '#3b82f6', height: 6, borderRadius: 6, transition: 'width .3s',
                    width: `${(uploadProgress.loaded / uploadProgress.total) * 100}%`,
                  }} />
                </div>
              )}
              {uploadErrors.length > 0 && (
                <div style={{ background: '#7f1d1d', borderRadius: 6, padding: 8, fontSize: '0.78rem' }}>
                  {uploadErrors.map((e, i) => <div key={i}>❌ {e.filename}: {e.error}</div>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lista file */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
          <div
            style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => toggleSection('files')}
          >
            <span>📋 File ({files.length}){selectedFiles.length > 0 && ` — ${selectedFiles.length} sel.`}</span>
            <span>{sectionsCollapsed.files ? '▶' : '▼'}</span>
          </div>

          {!sectionsCollapsed.files && (
            <>
              <input
                placeholder="Cerca..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ background: '#334155', border: 'none', borderRadius: 6, padding: '6px 10px', color: '#f1f5f9', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }}
              />

              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 340, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {sidebarFiles
                  .filter(f => f.filename.toLowerCase().includes(search.toLowerCase()))
                  .map(file => {
                    const isSelected   = selectedFiles.includes(file.filename);
                    const isValidating = ensureSet(validating).has(file.filename);
                    const errCount     = file.validation?.errors?.length  || 0;
                    const warnCount    = file.validation?.warnings?.length || 0;
                    const inRegistry   = file.entityID && registryCache[file.entityID]?.exists;
                    return (
                      <div
                        key={file.filename}
                        onClick={() => toggleFileSelection(file.filename)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                          background: isSelected ? '#2563eb' : '#334155',
                          border: isSelected ? '1px solid #3b82f6' : inRegistry ? '1px solid #7c3aed' : '1px solid transparent',
                        }}
                      >
                        <input type="checkbox" checked={isSelected} readOnly onClick={e => e.stopPropagation()} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                          {file.filename}
                        </span>
                        {isValidating
                          ? <span style={{ fontSize: '0.7rem', color: '#94a3b8', flexShrink: 0 }}>⟳</span>
                          : file.validation && (
                            <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                              {errCount === 0 && warnCount === 0 && <span style={{ fontSize: '0.7rem', background: '#166534', color: '#d1fae5', padding: '1px 5px', borderRadius: 8, fontWeight: 700 }}>✓</span>}
                              {errCount  > 0 && <span style={{ fontSize: '0.7rem', background: '#991b1b', color: '#fee2e2', padding: '1px 5px', borderRadius: 8, fontWeight: 700 }}>✕{errCount}</span>}
                              {warnCount > 0 && <span style={{ fontSize: '0.7rem', background: '#92400e', color: '#fef3c7', padding: '1px 5px', borderRadius: 8, fontWeight: 700 }}>⚠{warnCount}</span>}
                            </span>
                          )
                        }
                      </div>
                    );
                  })}
                {sidebarFiles.length === 0 && (
                  <div style={{ color: '#94a3b8', fontSize: '0.82rem', textAlign: 'center', marginTop: 20 }}>
                    Nessun file caricato
                  </div>
                )}
              </div>

              {/* Selezione rapida */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  defaultValue=""
                  onChange={async e => {
                    const val = e.target.value;
                    if (!val) return;
                    if (val === 'all')     selectAll();
                    if (val === 'none')    deselectAll();
                    if (val === 'invert') {
                      const allSel = files.every(f => selectedFiles.includes(f.filename));
                      allSel ? deselectAll() : selectAll();
                    }
                    if (val === 'errors')
                      setSelectedFiles(files.filter(f => f.validation?.errors?.length > 0).map(f => f.filename));
                    if (val === 'noerrors')
                      setSelectedFiles(files.filter(f => f.validation && f.validation.errors?.length === 0).map(f => f.filename));
                    if (val === 'registry') {
                      await Promise.all(
                        files.filter(f => f.entityID && !registryCache[f.entityID])
                             .map(f => loadRegistryData(f.entityID))
                      );
                      setSelectedFiles(prev => {
                        const sp    = Array.isArray(prev) ? prev : [];
                        const inReg = files.filter(f => f.entityID && registryCache[f.entityID]?.exists).map(f => f.filename);
                        const allIn = inReg.every(fn => sp.includes(fn));
                        return allIn ? sp.filter(fn => !inReg.includes(fn)) : [...new Set([...sp, ...inReg])];
                      });
                    }
                    e.target.value = '';
                  }}
                  style={{ flex: 1, background: '#334155', color: '#f1f5f9', border: '1px solid #475569', borderRadius: 6, padding: '6px 8px', fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  <option value="" disabled>⚡ Selezione rapida…</option>
                  <option value="all">☑ Tutti ({files.length})</option>
                  <option value="none">☐ Nessuno</option>
                  <option value="invert">⇄ Inverti</option>
                  <option value="errors">❌ Solo con errori</option>
                  <option value="noerrors">✅ Solo senza errori</option>
                  <option value="registry">🌐 Solo in Registry</option>
                </select>
                {selectedFiles.length > 0 && (
                  <button style={S.btn('#475569')} onClick={deselectAll} title="Cancella selezione">
                    ✗ {selectedFiles.length}
                  </button>
                )}
              </div>

              {/* Azioni selezione */}
              {selectedFiles.length > 0 && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ ...S.btn('#dc2626'), flex: 1 }} onClick={deleteSelected}>
                    🗑 Elimina ({selectedFiles.length})
                  </button>
                  <button style={{ ...S.btn('#10b981'), flex: 1 }} onClick={openPRPreview} disabled={!githubValid}>
                    🚀 PR
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <Link to="/history" style={{ color: '#94a3b8', fontSize: '0.82rem', textDecoration: 'none', paddingTop: 8, borderTop: '1px solid #334155' }}>
          📜 Storico PR
        </Link>
      </div>

      {/* ─── MAIN CONTENT ─────────────────────────────────── */}

      {activePage === 'users' && userRole === 'admin' && (
        <div style={S.main}><UserManagementPage /></div>
      )}

      {activePage === 'main' && (
        <div style={S.main}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ margin: 0 }}>Dettagli File ({sortedFiles.length})</h2>
            <button style={S.btn('#f1f5f9', '#374151')} onClick={loadFiles}>🔄 Aggiorna</button>
          </div>

          {sortedFiles.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 80, color: '#94a3b8' }}>
              <div style={{ fontSize: '4rem' }}>📂</div>
              <h3>Seleziona dei file dalla sidebar</h3>
              <p>Carica file XML e selezionali per vedere i dettagli</p>
            </div>
          ) : (
            <>
              <div style={S.card}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={S.th({ width: 36 })}></th>
                      <th style={S.sortTh('filename')}       onClick={() => handleSort('filename')}>Nome File{sortArrow('filename')}</th>
                      <th style={S.sortTh('organizationName')} onClick={() => handleSort('organizationName')}>Organizzazione{sortArrow('organizationName')}</th>
                      <th style={S.th()}>Entity ID</th>
                      <th style={S.sortTh('creationDate')}   onClick={() => handleSort('creationDate')}>Data{sortArrow('creationDate')}</th>
                      <th style={S.th()}>Validazione</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedFiles.map(file => {
                      const safeExpanded = Array.isArray(expandedRows) ? expandedRows : [];
                      const isExpanded   = safeExpanded.includes(file.filename);
                      const isValidating = ensureSet(validating).has(file.filename);
                      const registry     = file.entityID ? registryCache[file.entityID] : null;
                      const certCacheKey = file.filename && file.entityID
                        ? `${file.filename}::${file.entityID}`
                        : file.entityID;
                      const certInfo     = certCacheKey ? certificateCache[certCacheKey] : null;
                      const certLoading  = file.entityID ? ensureSet(certificateLoading).has(file.entityID) : false;
                      const valErrors    = Array.isArray(file?.validation?.errors)   ? file.validation.errors   : [];
                      const valWarnings  = Array.isArray(file?.validation?.warnings) ? file.validation.warnings : [];
                      const certErrors   = Array.isArray(certInfo?.errors)           ? certInfo.errors           : [];

                      return (
                        <React.Fragment key={file.filename}>
                          {/* ── riga principale ── */}
                          <tr
                            onClick={() => toggleRowExpansion(file.filename)}
                            style={{ cursor: 'pointer', background: isExpanded ? '#f0f9ff' : '#fff' }}
                          >
                            <td style={{ ...S.td, textAlign: 'center', fontWeight: 700, color: '#3b82f6' }}>
                              {isExpanded ? '−' : '+'}
                            </td>
                            <td style={S.td}><code style={{ fontSize: '0.8rem' }}>{file.filename}</code></td>
                            <td style={S.td}>{file.organizationName || <span style={{ color: '#9ca3af' }}>N/A</span>}</td>
                            <td style={S.td}>
                              <span style={{ fontSize: '0.76rem', color: '#6b7280' }}>
                                {file.entityID
                                  ? `${file.entityID.substring(0, 45)}…`
                                  : <span style={{ color: '#9ca3af' }}>N/A</span>
                                }
                              </span>
                            </td>
                            <td style={S.td}>
                              {file.creationDate ? new Date(file.creationDate).toLocaleDateString('it-IT') : 'N/A'}
                            </td>
                            <td style={S.td}>
                              {isValidating
                                ? <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>⟳ validazione...</span>
                                : <ValidationBadge validation={file.validation} />
                              }
                            </td>
                          </tr>

                          {/* ── riga espansa ── */}
                          {isExpanded && (
                            <tr>
                              <td colSpan="6" style={{ background: '#f8fafc', padding: '16px 20px' }}>

                                {/* Banner registro */}
                                {file.entityID && registry?.exists && (
                                  <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6, background: '#ecfdf3', borderLeft: '4px solid #16a34a', color: '#166534', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span>✅ EntityID presente nel registro SPID</span>
                                    {registry.registry_link && (
                                      <a
                                        href={registry.registry_link}
                                        target="_blank" rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        style={{ color: '#15803d', fontWeight: 600, textDecoration: 'none' }}
                                      >
                                        🔗 Scheda registro
                                      </a>
                                    )}
                                  </div>
                                )}
                                {file.entityID && registry && !registry.exists && (
                                  <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6, background: '#fef2f2', borderLeft: '4px solid #dc2626', color: '#991b1b', fontSize: '0.85rem' }}>
                                    ❌ EntityID non trovato nel registro SPID
                                  </div>
                                )}
                                {file.entityID && !registry && (
                                  <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6, background: '#f1f5f9', borderLeft: '4px solid #94a3b8', color: '#64748b', fontSize: '0.85rem' }}>
                                    ⟳ Verifica registro SPID in corso…
                                  </div>
                                )}

                                {/* Tabella dettagli */}
                                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', marginBottom: 12 }}>
                                  <tbody>
                                    {[
                                      ['Nome file',
                                        <button onClick={e => { e.stopPropagation(); handleViewXml(file.filename); }}
                                          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer',
                                            textDecoration: 'underline', padding: 0, fontSize: '0.85rem' }}>
                                          {file.filename}
                                        </button>
                                      ],                                      ['EntityID',       file.entityID        || 'N/D'],
                                      ['Organizzazione', file.organizationName || 'N/D'],
                                      ['Data creazione', file.creationDate
                                        ? new Date(registry?.createDate || file.creationDate).toLocaleString('it-IT')
                                        : 'N/D'],
                                      ['Data modifica',  file.modificationDate
                                        ? new Date(registry?.lastUpdateDate || file.modificationDate).toLocaleString('it-IT')
                                        : 'N/D'],
                                      ['Dimensione', file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'N/D'],
                                    ].map(([label, value], i) => (
                                      <tr key={i}>
                                        <th style={{ padding: '5px 16px 5px 0', fontWeight: 600, color: '#374151', width: 150, verticalAlign: 'top' }}>{label}</th>
                                        <td style={{ padding: '5px 0', color: '#1e293b' }}>{value}</td>
                                      </tr>
                                    ))}

                                    {/* Certificato */}
                                    <tr>
                                      <th style={{ padding: '5px 16px 5px 0', fontWeight: 600, color: '#374151', width: 150, verticalAlign: 'top' }}>
                                        Certificato di sigillo
                                      </th>
                                      <td style={{ padding: '5px 0', color: '#1e293b' }}>
                                        {certLoading && <span>Verifica certificato in corso...</span>}
                                        {!certLoading && certInfo?.certificate && (
                                          <>
                                            {certInfo.source === 'registry' && certInfo.valid && (
                                              <div style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 6,
                                                background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                                                border: '1px solid #86efac', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: '1.1rem' }}>🏛️</span>
                                                <div>
                                                  <div style={{ fontWeight: 700, color: '#15803d', fontSize: '0.85rem' }}>
                                                    Certificato verificato nel registro SPID
                                                  </div>
                                                  <div style={{ color: '#166534', fontSize: '0.78rem' }}>
                                                    Il certificato corrisponde a quello pubblicato ufficialmente da AgID
                                                  </div>
                                                </div>
                                                <span style={{ marginLeft: 'auto', background: '#16a34a', color: '#fff',
                                                  borderRadius: 99, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>
                                                  UFFICIALE
                                                </span>
                                              </div>
                                            )}
                                            <details style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: 8,
                                              marginTop: certInfo.source === 'registry' && certInfo.valid ? 0 : 4 }}>
                                              <summary style={{ cursor: 'pointer', fontWeight: 600, listStyle: 'none' }}>
                                                {certInfo.valid ? '✅ Certificato valido' : '❌ Certificato non valido'}
                                                {certInfo.source === 'registry' && (
                                                  <span style={{ marginLeft: 8, fontSize: '0.78rem', color: '#15803d', fontWeight: 400 }}>
                                                    (dal registro SPID)
                                                  </span>
                                                )}
                                                {certInfo.source === 'xml' && (
                                                  <span style={{ marginLeft: 8, fontSize: '0.78rem', color: '#64748b', fontWeight: 400 }}>
                                                    (da XML locale)
                                                  </span>
                                                )}
                                              </summary>
                                              <div style={{ marginTop: 8, paddingLeft: 12, fontSize: '0.82rem' }}>
                                                <div><strong>Not Before:</strong> {certInfo.certificate.notBefore || 'N/D'}</div>
                                                <div><strong>Not After:</strong>  {certInfo.certificate.notAfter  || 'N/D'}</div>
                                                <div><strong>Subject:</strong>    {certInfo.certificate.subject   || 'N/D'}</div>
                                                <div><strong>Issuer:</strong>     {certInfo.certificate.issuer    || 'N/D'}</div>
                                                {certErrors.length > 0 && (
                                                  <div style={{ marginTop: 6, color: '#991b1b' }}>
                                                    <strong>Errori:</strong>
                                                    <ul style={{ margin: '2px 0', paddingLeft: 16 }}>
                                                      {certErrors.map((e, i) => (
                                                        <li key={i}>{typeof e === 'string' ? e : JSON.stringify(e)}</li>
                                                      ))}
                                                    </ul>
                                                  </div>
                                                )}
                                              </div>
                                            </details>
                                          </>
                                        )}
                                        {!certLoading && certInfo?.error && (
                                          <span style={{ color: '#991b1b' }}>{certInfo.error}</span>
                                        )}
                                        {!certLoading && !certInfo && <span>N/D</span>}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>

                                {/* Validazione */}
                                {isValidating && (
                                  <div style={{ padding: 10, borderRadius: 6, background: '#f1f5f9', color: '#64748b', fontSize: '0.85rem' }}>
                                    ⟳ Validazione in corso…
                                  </div>
                                )}
                                {!isValidating && file.validation && (
                                  <>
                                    {valErrors.length > 0 && (
                                      <div style={{ marginBottom: 8, padding: 12, borderRadius: 6, background: '#fef2f2', borderLeft: '4px solid #dc2626' }}>
                                        <strong style={{ color: '#991b1b', display: 'block', marginBottom: 6 }}>
                                          ❌ Errori di validazione ({valErrors.length})
                                        </strong>
                                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                                          {valErrors.map((e, i) => (
                                            <li key={i} style={{ fontSize: '0.82rem', color: '#991b1b', marginBottom: 3 }}>
                                              {e.source === 'certificate' ? '🔐 ' : ''}
                                              {typeof e === 'object'
                                                ? `[${e.testId || e.test_id || e.testid || 'N/D'}] ${e.message || JSON.stringify(e)}`
                                                : e}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {valWarnings.length > 0 && (
                                      <div style={{ marginBottom: 8, padding: 12, borderRadius: 6, background: '#fffbeb', borderLeft: '4px solid #d97706' }}>
                                        <strong style={{ color: '#92400e', display: 'block', marginBottom: 6 }}>
                                          ⚠️ Warning ({valWarnings.length})
                                        </strong>
                                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                                          {valWarnings.map((w, i) => (
                                            <li key={i} style={{ fontSize: '0.82rem', color: '#92400e', marginBottom: 3 }}>
                                              {typeof w === 'object'
                                                ? `[${w.testId || w.test_id || w.testid || 'N/D'}] ${w.message || JSON.stringify(w)}`
                                                : w}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {valErrors.length === 0 && valWarnings.length === 0 && (
                                      <div style={{ padding: 10, borderRadius: 6, background: '#ecfdf3', borderLeft: '4px solid #16a34a', color: '#166534', fontSize: '0.85rem' }}>
                                        ✅ Nessun errore o warning di validazione.
                                      </div>
                                    )}
                                  </>
                                )}
                                {!isValidating && !file.validation && (
                                  <div style={{ padding: 10, borderRadius: 6, background: '#f1f5f9', color: '#94a3b8', fontSize: '0.85rem' }}>
                                    Validazione non ancora disponibile.
                                  </div>
                                )}

                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginazione */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
                  <button style={S.btn('#f1f5f9', '#374151')} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    ← Prec.
                  </button>
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>Pag. {page} / {totalPages}</span>
                  <button style={S.btn('#f1f5f9', '#374151')} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    Succ. →
                  </button>
                  <select
                    value={resultsPerPage}
                    onChange={e => { setResultsPerPage(Number(e.target.value)); setPage(1); }}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.85rem' }}
                  >
                    {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / pag.</option>)}
                  </select>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── MODAL XML ────────────────────────────────────── */}
      {xmlModalContent && (
        <div
          onClick={() => setXmlModalContent(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 10, padding: 24, width: '80vw', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <strong>{xmlModalContent.filename}</strong>
              <button onClick={() => setXmlModalContent(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            <pre style={{ background: '#f8fafc', borderRadius: 6, padding: 16, fontSize: '0.76rem', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
              {xmlModalContent.content}
            </pre>
          </div>
        </div>
      )}

      {/* ─── MODAL PR PREVIEW ─────────────────────────────── */}
      {prPreview && (
        <PRPreviewModal
          preview={prPreview}
          onConfirm={confirmCreatePR}
          onCancel={() => setPrPreview(null)}
          loading={prInProgress}
        />
      )}

      {/* ─── MODAL PR IN CORSO ────────────────────────────── */}
      {prInProgress && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ProgressTracker steps={prSteps} currentStep={prStep} />
        </div>
      )}

    </div>
  );
}
