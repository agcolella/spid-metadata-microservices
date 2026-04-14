import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';

const TOKEN_KEY = 'spid_token';
const LS_KEY    = 'spid-pr-history';
const API_BASE  = process.env.REACT_APP_GATEWAY_URL || 'http://localhost:8080';

// ─────────────────────────────────────────────────────────────
export default function PRHistoryView() {
  const [pullRequests, setPullRequests] = useState([]);
  const [expandedPRs,  setExpandedPRs]  = useState([]);
  const [syncing,      setSyncing]       = useState(false);
  const [filters,      setFilters]       = useState({ search: '', dateFrom: '', dateTo: '' });

  // ref per evitare stale closure nell'intervallo
  const prRef = useRef([]);
  useEffect(() => { prRef.current = pullRequests; }, [pullRequests]);

  // ── sync stati PR da GitHub ─────────────────────────────
  const syncStatuses = useCallback(async (source) => {
    const list = source ?? prRef.current;
    if (!list?.length) return;
    setSyncing(true);
    try {
      const updated = list.map(pr => ({ ...pr }));
      let changed = false;
      for (let i = 0; i < updated.length; i++) {
        const pr = updated[i];
        if (!pr.number) continue;
        try {
          const res = await fetch(
            `${API_BASE}/api/pr/status/${pr.number}`,
            { headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` } }
          );
          if (!res.ok) continue;
          const data      = await res.json();
          let   newStatus = data.state;
          if (data.merged) newStatus = 'merged';
          if (newStatus && newStatus !== pr.status) {
            updated[i] = { ...pr, status: newStatus };
            changed = true;
          }
        } catch { /* ignora errori singoli */ }
      }
      if (changed) {
        setPullRequests(updated);
        localStorage.setItem(LS_KEY, JSON.stringify(updated));
      }
    } finally { setSyncing(false); }
  }, []);

  // ── caricamento iniziale + polling 30 s ─────────────────
  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    let loaded = [];
    try {
      const parsed = JSON.parse(raw);
      loaded = Array.isArray(parsed)
        ? parsed.map(pr => ({
            ...pr,
            organizations: Array.isArray(pr.organizations) ? pr.organizations : [],
            fileCount:     typeof pr.fileCount === 'number' ? pr.fileCount : (pr.files?.length || 0),
            createdAt:     pr.createdAt || new Date().toISOString(),
            status:        pr.status    || 'open',
          }))
        : [];
    } catch { loaded = []; }
    setPullRequests(loaded);
    if (loaded.length > 0) syncStatuses(loaded);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => {
      if (prRef.current.length > 0) syncStatuses();
    }, 30_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── toggle riga ─────────────────────────────────────────
  const togglePR = (id) =>
    setExpandedPRs(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

  // ── filtri ──────────────────────────────────────────────
  const filteredPRs = pullRequests.filter(pr => {
    const d = new Date(pr.createdAt || new Date());
    const matchSearch =
      !filters.search ||
      (pr.organizations || []).some(o => o.toLowerCase().includes(filters.search.toLowerCase())) ||
      (pr.branch || '').toLowerCase().includes(filters.search.toLowerCase());
    const matchFrom = !filters.dateFrom || d >= new Date(filters.dateFrom);
    const matchTo   = !filters.dateTo   || d <= new Date(filters.dateTo);
    return matchSearch && matchFrom && matchTo;
  });

  // ── badge stato ─────────────────────────────────────────
  const statusBadge = (s) => ({
    open:   { bg: '#dcfce7', color: '#166534', label: '🟢 Aperta'  },
    merged: { bg: '#ede9fe', color: '#5b21b6', label: '🟣 Merged'  },
    closed: { bg: '#fee2e2', color: '#991b1b', label: '🔴 Chiusa'  },
  }[s] || { bg: '#f1f5f9', color: '#374151', label: s || '—' });

  // ── stili ───────────────────────────────────────────────
  const S = {
    page: {
      minHeight: '100vh', background: '#f8fafc',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      padding: 24,
    },
    card: { background: '#fff', borderRadius: 10, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,.08)' },
    th:   { padding: '10px 16px', background: '#f1f5f9', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600, color: '#374151' },
    td:   { padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' },
    btn:  (bg = '#3b82f6', c = '#fff') => ({
      background: bg, color: c, border: 'none', borderRadius: 6,
      padding: '8px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
    }),
  };

  // ══════════════════════════════════════════════════════════
  return (
    <div style={S.page}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ── header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0 }}>📜 Storico Pull Request</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {syncing && (
              <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>🔄 Sincronizzazione…</span>
            )}
            <button style={S.btn('#f1f5f9', '#374151')} onClick={() => syncStatuses()} disabled={syncing}>
              🔄 Aggiorna stati
            </button>
            <Link to="/"
              style={{ ...S.btn('#f1f5f9', '#374151'), textDecoration: 'none', display: 'inline-block' }}>
              ← Home
            </Link>
          </div>
        </div>

        {/* ── filtri ── */}
        <div style={{ ...S.card, marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', padding: '16px 20px' }}>
          {[
            { label: 'Cerca',    type: 'text', placeholder: 'Organizzazione, branch…', key: 'search'   },
            { label: 'Da Data',  type: 'date', placeholder: '',                         key: 'dateFrom' },
            { label: 'A Data',   type: 'date', placeholder: '',                         key: 'dateTo'   },
          ].map(({ label, type, placeholder, key }) => (
            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
              {label}
              <input
                type={type}
                placeholder={placeholder}
                value={filters[key]}
                onChange={e => setFilters(prev => ({ ...prev, [key]: e.target.value }))}
                style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', minWidth: 180 }}
              />
            </label>
          ))}
          {(filters.search || filters.dateFrom || filters.dateTo) && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button style={S.btn('#f1f5f9', '#374151')}
                onClick={() => setFilters({ search: '', dateFrom: '', dateTo: '' })}>
                ✕ Reset filtri
              </button>
            </div>
          )}
        </div>

        {/* ── contatore risultati ── */}
        {pullRequests.length > 0 && (
          <div style={{ marginBottom: 12, fontSize: '0.85rem', color: '#6b7280' }}>
            {filteredPRs.length} di {pullRequests.length} PR
            {filteredPRs.length !== pullRequests.length && ' (filtrate)'}
          </div>
        )}

        {/* ── stato vuoto ── */}
        {filteredPRs.length === 0 ? (
          <div style={{ ...S.card, textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
            <h3 style={{ margin: '0 0 8px', color: '#64748b' }}>
              {pullRequests.length === 0 ? 'Nessuna Pull Request' : 'Nessun risultato'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              {pullRequests.length === 0
                ? 'Le PR create dalla Dashboard appariranno qui'
                : 'Prova a modificare i filtri di ricerca'}
            </p>
          </div>
        ) : (
          /* ── tabella PR ── */
          <div style={S.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['', 'PR #', 'Branch', 'Organizzazioni', 'File', 'Data', 'Stato'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPRs.map(pr => {
                  const badge     = statusBadge(pr.status);
                  const isExpanded = expandedPRs.includes(pr.id);
                  return (
                    <React.Fragment key={pr.id || pr.number}>

                      {/* ── riga principale ── */}
                      <tr style={{ background: isExpanded ? '#f0f9ff' : '#fff' }}>
                        <td style={{ ...S.td, textAlign: 'center', cursor: 'pointer', color: '#3b82f6', fontWeight: 700 }}
                          onClick={() => togglePR(pr.id)}>
                          {isExpanded ? '−' : '+'}
                        </td>
                        <td style={S.td}>
                          {pr.url
                            ? <a href={pr.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', fontWeight: 600 }}>
                                #{pr.number}
                              </a>
                            : <span style={{ color: '#94a3b8' }}>#{pr.number || '—'}</span>
                          }
                        </td>
                        <td style={S.td}>
                          <code style={{ fontSize: '0.82rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                            {pr.branch || '—'}
                          </code>
                        </td>
                        <td style={S.td}>
                          <span style={{ fontWeight: 600 }}>{(pr.organizations || []).length}</span>
                          <span style={{ color: '#94a3b8', marginLeft: 4 }}>enti</span>
                        </td>
                        <td style={{ ...S.td, textAlign: 'center' }}>
                          {pr.fileCount || 0}
                        </td>
                        <td style={S.td}>
                          {new Date(pr.createdAt || new Date()).toLocaleDateString('it-IT', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                          })}
                        </td>
                        <td style={S.td}>
                          <span style={{ background: badge.bg, color: badge.color, padding: '3px 10px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 600 }}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>

                      {/* ── riga espansa ── */}
                      {isExpanded && (
                        <tr>
                          <td colSpan="7" style={{ background: '#f8fafc', padding: '16px 24px', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>

                              {/* Organizzazioni */}
                              <div style={{ flex: 1, minWidth: 260 }}>
                                <strong style={{ fontSize: '0.88rem', color: '#374151', display: 'block', marginBottom: 8 }}>
                                  Organizzazioni ({(pr.organizations || []).length})
                                </strong>
                                {(pr.organizations || []).length === 0 ? (
                                  <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                                    Nessuna organizzazione salvata
                                  </span>
                                ) : (
                                  <ul style={{ margin: 0, padding: '0 0 0 16px', columns: 2, columnGap: 24 }}>
                                    {(pr.organizations || []).map((o, i) => (
                                      <li key={i} style={{ fontSize: '0.85rem', color: '#1e293b', marginBottom: 4 }}>{o}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              {/* Dettagli PR */}
                              <div style={{ minWidth: 240 }}>
                                <strong style={{ fontSize: '0.88rem', color: '#374151', display: 'block', marginBottom: 8 }}>
                                  Dettagli PR
                                </strong>
                                <table style={{ fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                                  <tbody>
                                    {[
                                      ['Numero',  `#${pr.number || '—'}`],
                                      ['Branch',  pr.branch     || '—'],
                                      ['File',    `${pr.fileCount || 0} file`],
                                      ['Creata il', new Date(pr.createdAt || new Date()).toLocaleString('it-IT')],
                                      ['Stato',   badge.label],
                                    ].map(([k, v]) => (
                                      <tr key={k}>
                                        <td style={{ paddingRight: 16, paddingBottom: 4, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{k}</td>
                                        <td style={{ paddingBottom: 4, color: '#1e293b' }}>{v}</td>
                                      </tr>
                                    ))}
                                    {pr.url && (
                                      <tr>
                                        <td style={{ paddingRight: 16, fontWeight: 600, color: '#374151' }}>Link</td>
                                        <td>
                                          <a href={pr.url} target="_blank" rel="noopener noreferrer"
                                            style={{ color: '#3b82f6', wordBreak: 'break-all', fontSize: '0.82rem' }}>
                                            {pr.url}
                                          </a>
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}

                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}
