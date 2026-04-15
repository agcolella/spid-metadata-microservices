import React from 'react';

export function FileRowDetail({
  file,
  registry,
  certInfo,
  certLoading,
  isValidating,
  onViewXml,
}) {
  const validationErrors   = Array.isArray(file?.validation?.errors)   ? file.validation.errors   : [];
  const validationWarnings = Array.isArray(file?.validation?.warnings) ? file.validation.warnings : [];
  const certErrors         = Array.isArray(certInfo?.errors)           ? certInfo.errors           : [];

  // Certificato verificato dal registro SPID (non solo dall'XML locale)
  const certFromRegistry = certInfo?.source === 'registry' && certInfo?.valid;

  return (
    <tr>
      <td colSpan="6" style={{ background: '#f8fafc', padding: '16px 20px' }}>

        {/* Registry badge */}
        {file.entityID && registry?.exists && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6,
            background: '#ecfdf3', borderLeft: '4px solid #16a34a', color: '#166534',
            fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>✅ EntityID presente nel registro SPID</span>
            {registry.registry_link && (
              <a href={registry.registry_link} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ color: '#15803d', fontWeight: 600, textDecoration: 'none' }}>
                🔗 Scheda registro
              </a>
            )}
          </div>
        )}
        {file.entityID && registry && !registry.exists && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6,
            background: '#fef2f2', borderLeft: '4px solid #dc2626', color: '#991b1b',
            fontSize: '0.85rem' }}>
            ❌ EntityID non trovato nel registro SPID
          </div>
        )}
        {file.entityID && !registry && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6,
            background: '#f1f5f9', borderLeft: '4px solid #94a3b8', color: '#64748b',
            fontSize: '0.85rem' }}>
            ⟳ Verifica registro SPID in corso…
          </div>
        )}

        {/* Dettagli file */}
        <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', marginBottom: 12 }}>
          <tbody>
            {[
              ['Nome file',
                // ── MIGLIORIA 1: nome file sempre cliccabile ──
                <button onClick={e => { e.stopPropagation(); onViewXml(file.filename); }}
                  style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer',
                    textDecoration: 'underline', padding: 0, fontSize: '0.85rem' }}>
                  {file.filename}
                </button>
              ],
              ['EntityID',       file.entityID         || 'N/D'],
              ['Organizzazione', file.organizationName  || 'N/D'],
              ['Data creazione', file.creationDate
                ? new Date(registry?.createDate     || file.creationDate).toLocaleString('it-IT')
                : 'N/D'],
              ['Data modifica',  file.modificationDate
                ? new Date(registry?.lastUpdateDate || file.modificationDate).toLocaleString('it-IT')
                : 'N/D'],
              ['Dimensione',     file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'N/D'],
            ].map((row, i) => (
              <tr key={i}>
                <th style={{ padding: '5px 16px 5px 0', fontWeight: 600, color: '#374151',
                  width: 150, verticalAlign: 'top' }}>
                  {row[0]}
                </th>
                <td style={{ padding: '5px 0', color: '#1e293b' }}>{row[1]}</td>
              </tr>
            ))}

            {/* Certificato */}
            <tr>
              <th style={{ padding: '5px 16px 5px 0', fontWeight: 600, color: '#374151',
                width: 150, verticalAlign: 'top' }}>
                Certificato di sigillo
              </th>
              <td style={{ padding: '5px 0', color: '#1e293b' }}>
                {certLoading && <span style={{ color: '#64748b' }}>Verifica certificato in corso...</span>}

                {!certLoading && certInfo?.certificate && (
                  <>
                    {/* ── MIGLIORIA 2: badge registro SPID prominente ── */}
                    {certFromRegistry && (
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

                    <details style={{ border: '1px solid #d1d5db', borderRadius: 6,
                      padding: 8, marginTop: certFromRegistry ? 0 : 4 }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 600, listStyle: 'none' }}>
                        {certInfo.valid ? '✅ Certificato valido' : '❌ Certificato non valido'}
                        {certInfo.source === 'xml'      && <span style={{ marginLeft: 8, fontSize: '0.78rem',
                          color: '#64748b', fontWeight: 400 }}>(da XML locale)</span>}
                        {certInfo.source === 'registry' && <span style={{ marginLeft: 8, fontSize: '0.78rem',
                          color: '#15803d', fontWeight: 400 }}>(dal registro SPID)</span>}
                      </summary>
                      <div style={{ marginTop: 8, paddingLeft: 12, fontSize: '0.82rem' }}>
                        <div><strong>Not Before:</strong> {new Date(certInfo.certificate.notBefore).toLocaleString('it-IT')}</div>
                        <div><strong>Not After:</strong>  {new Date(certInfo.certificate.notAfter).toLocaleString('it-IT')}</div>
                        <div><strong>Subject:</strong>    {certInfo.certificate.subject   || 'N/D'}</div>
                        <div><strong>Issuer:</strong>     {certInfo.certificate.issuer    || 'N/D'}</div>
                        {certInfo.certificate.fingerprint && (
                          <div style={{ marginTop: 4, wordBreak: 'break-all', color: '#6b7280' }}>
                            <strong>SHA-1:</strong> {certInfo.certificate.fingerprint}
                          </div>
                        )}
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

                {!certLoading && certInfo?.error  && (
                  <span style={{ color: '#991b1b' }}>{certInfo.error}</span>
                )}
                {!certLoading && !certInfo && <span style={{ color: '#94a3b8' }}>N/D</span>}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Validazione */}
        {isValidating && (
          <div style={{ padding: 10, borderRadius: 6, background: '#f1f5f9',
            color: '#64748b', fontSize: '0.85rem' }}>
            ⟳ Validazione in corso…
          </div>
        )}
        {!isValidating && file.validation && (
          <>
            {validationErrors.length > 0 && (
              <div style={{ marginBottom: 8, padding: 12, borderRadius: 6,
                background: '#fef2f2', borderLeft: '4px solid #dc2626' }}>
                <strong style={{ color: '#991b1b', display: 'block', marginBottom: 6 }}>
                  ❌ Errori di validazione ({validationErrors.length})
                </strong>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {validationErrors.map((e, i) => (
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
            {validationWarnings.length > 0 && (
              <div style={{ marginBottom: 8, padding: 12, borderRadius: 6,
                background: '#fffbeb', borderLeft: '4px solid #d97706' }}>
                <strong style={{ color: '#92400e', display: 'block', marginBottom: 6 }}>
                  ⚠️ Warning ({validationWarnings.length})
                </strong>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {validationWarnings.map((w, i) => (
                    <li key={i} style={{ fontSize: '0.82rem', color: '#92400e', marginBottom: 3 }}>
                      {typeof w === 'object'
                        ? `[${w.testId || w.test_id || w.testid || 'N/D'}] ${w.message || JSON.stringify(w)}`
                        : w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {validationErrors.length === 0 && validationWarnings.length === 0 && (
              <div style={{ padding: 10, borderRadius: 6, background: '#ecfdf3',
                borderLeft: '4px solid #16a34a', color: '#166534', fontSize: '0.85rem' }}>
                ✅ Nessun errore o warning di validazione.
              </div>
            )}
          </>
        )}
        {!isValidating && !file.validation && (
          <div style={{ padding: 10, borderRadius: 6, background: '#f1f5f9',
            color: '#94a3b8', fontSize: '0.85rem' }}>
            Validazione non ancora disponibile.
          </div>
        )}
      </td>
    </tr>
  );
}
