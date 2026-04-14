import React from 'react';
import { Link } from 'react-router-dom';

export function Sidebar({
  files, selectedFiles, search, onSearchChange,
  sidebarFiles, validating, registryCache, ensureSet,
  sectionsCollapsed, onToggleSection,
  uploadProgress, uploadErrors,
  fileInputRef, dirInputRef, onUpload,
  errorFilterMode,
  onToggleFile, onSelectAll, onDeselectAll, onSelectQuick,
  onDeleteSelected, onOpenPRPreview,
  githubValid, activePage, onSetActivePage, userRole,
}) {
  const S = {
    sidebar: { width: 290, minHeight: '100vh', background: '#1e293b', color: '#f1f5f9',
      display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflowY: 'auto', flexShrink: 0 },
    btn: (bg = '#3b82f6', c = '#fff') => ({
      background: bg, color: c, border: 'none', borderRadius: 6,
      padding: '8px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
    }),
  };

  return (
    <div style={S.sidebar}>
      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>📁 SPID Metadata</div>

      {/* Nav */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
        <button onClick={() => onSetActivePage('main')}
          style={{ background: activePage === 'main' ? '#3b82f6' : 'transparent',
            color: '#f1f5f9', border: 'none', borderRadius: 6, padding: '8px 10px',
            cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem',
            fontWeight: activePage === 'main' ? 700 : 400 }}>
          🏠 Dashboard
        </button>
        {userRole === 'admin' && (
          <button onClick={() => onSetActivePage('users')}
            style={{ background: activePage === 'users' ? '#3b82f6' : 'transparent',
              color: '#f1f5f9', border: 'none', borderRadius: 6, padding: '8px 10px',
              cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem',
              fontWeight: activePage === 'users' ? 700 : 400 }}>
            👥 Gestione Utenti
          </button>
        )}
      </div>

      {githubValid === false && (
        <div style={{ background: '#7f1d1d', borderRadius: 6, padding: '8px 10px', fontSize: '0.8rem' }}>
          ⚠️ GitHub non configurato
        </div>
      )}

      {/* Upload */}
      <div style={{ borderBottom: '1px solid #334155', paddingBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => onToggleSection('upload')}>
          <span>📤 Upload{uploadProgress.active && ` (${uploadProgress.loaded}/${uploadProgress.total})`}</span>
          <span>{sectionsCollapsed.upload ? '▶' : '▼'}</span>
        </div>
        {!sectionsCollapsed.upload && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input type="file" ref={fileInputRef} multiple accept=".xml" style={{ display: 'none' }} onChange={onUpload} />
            <input type="file" ref={dirInputRef}  multiple accept=".xml" style={{ display: 'none' }} onChange={onUpload} webkitdirectory="true" />
            <button style={S.btn()} onClick={() => fileInputRef.current.click()} disabled={uploadProgress.active}>
              📁 Scegli File
            </button>
            <button style={S.btn('#475569')} onClick={() => dirInputRef.current.click()} disabled={uploadProgress.active}>
              📂 Scegli Cartella
            </button>
            {uploadProgress.active && (
              <div style={{ background: '#334155', borderRadius: 6, height: 6 }}>
                <div style={{ background: '#3b82f6', height: 6, borderRadius: 6, transition: 'width .3s',
                  width: `${(uploadProgress.loaded / uploadProgress.total) * 100}%` }} />
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

      {/* File list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
        <div style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => onToggleSection('files')}>
          <span>📋 File ({files.length}){selectedFiles.length > 0 && ` — ${selectedFiles.length} sel.`}</span>
          <span>{sectionsCollapsed.files ? '▶' : '▼'}</span>
        </div>
        {!sectionsCollapsed.files && (
          <>
            <input placeholder="Cerca..." value={search} onChange={e => onSearchChange(e.target.value)}
              style={{ background: '#334155', border: 'none', borderRadius: 6, padding: '6px 10px',
                color: '#f1f5f9', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} />

            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 340, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {sidebarFiles
                .filter(f => f.filename.toLowerCase().includes(search.toLowerCase()))
                .map(file => {
                  const isSelected   = selectedFiles.includes(file.filename);
                  const isValidating = ensureSet(validating).has(file.filename);
                  const errCount     = file.validation?.errors?.length > 0;
                  const warnCount    = file.validation?.warnings?.length || 0;
                  const inRegistry   = file.entityID && registryCache[file.entityID]?.exists;
                  return (
                    <div key={file.filename}
                      onClick={() => onToggleFile(file.filename)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
                        borderRadius: 6, cursor: 'pointer',
                        background:  isSelected ? '#2563eb' : '#334155',
                        border:      isSelected ? '1px solid #3b82f6' : inRegistry ? '1px solid #7c3aed' : '1px solid transparent',
                        boxShadow:   inRegistry && !isSelected ? '0 0 0 1px #7c3aed33' : 'none' }}>
                      <input type="checkbox" checked={isSelected}
                        onChange={e => { e.stopPropagation(); onToggleFile(file.filename); }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        {file.filename}
                      </span>
                      {isValidating
                        ? <span style={{ fontSize: '0.7rem', color: '#94a3b8', flexShrink: 0 }}>⟳</span>
                        : file.validation ? (
                          <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                            {errCount === 0 && warnCount === 0 && (
                              <span style={{ fontSize: '0.7rem', background: '#166534', color: '#d1fae5',
                                padding: '1px 5px', borderRadius: 8, fontWeight: 700 }}>✓</span>
                            )}
                            {errCount > 0 && (
                              <span style={{ fontSize: '0.7rem', background: '#991b1b', color: '#fee2e2',
                                padding: '1px 5px', borderRadius: 8, fontWeight: 700 }}>
                                ✕{file.validation.errors.length}
                              </span>
                            )}
                            {warnCount > 0 && (
                              <span style={{ fontSize: '0.7rem', background: '#92400e', color: '#fef3c7',
                                padding: '1px 5px', borderRadius: 8, fontWeight: 700 }}>⚠{warnCount}</span>
                            )}
                          </span>
                        ) : null}
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
              <select onChange={e => { onSelectQuick(e.target.value); e.target.value = ''; }}
                defaultValue=""
                style={{ flex: 1, background: '#334155', color: '#f1f5f9', border: '1px solid #475569',
                  borderRadius: 6, padding: '6px 8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                <option value="" disabled>⚡ Selezione rapida…</option>
                <option value="all">☑ Tutti ({files.length})</option>
                <option value="none">☐ Nessuno</option>
                <option value="invert">⇄ Inverti</option>
                <option value="errors">❌ Solo con errori</option>
                <option value="noerrors">✅ Solo senza errori</option>
                <option value="registry">🌐 Solo in Registry</option>
              </select>
              {selectedFiles.length > 0 && (
                <button style={S.btn('#475569')} onClick={onDeselectAll} title="Cancella selezione">
                  ✗ {selectedFiles.length}
                </button>
              )}
            </div>

            {selectedFiles.length > 0 && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...S.btn('#dc2626'), flex: 1 }} onClick={onDeleteSelected}>
                  🗑 Elimina ({selectedFiles.length})
                </button>
                <button style={{ ...S.btn('#10b981'), flex: 1 }} onClick={onOpenPRPreview} disabled={!githubValid}>
                  🚀 PR ({selectedFiles.length})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Link to="/history"
        style={{ color: '#94a3b8', fontSize: '0.82rem', textDecoration: 'none',
          paddingTop: 8, borderTop: '1px solid #334155' }}>
        📜 Storico PR
      </Link>
    </div>
  );
}
