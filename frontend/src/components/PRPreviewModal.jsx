import React from 'react';

export function PRPreviewModal({ preview, onConfirm, onCancel, loading }) {
  if (!preview) return null;
  const hasErrors     = preview.validation?.errors?.length > 0;
  const hasWarnings   = preview.validation?.warnings?.length > 0;
  const hasDuplicates = preview.validation?.duplicates?.length > 0;

  return (
    <div onClick={onCancel} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:12, padding:32, width:'90vw', maxWidth:640, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(0,0,0,.25)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ margin:0 }}>📋 Anteprima Pull Request</h2>
          <button onClick={onCancel} style={{ background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer' }}>×</button>
        </div>

        <p><strong>Titolo:</strong> {preview.title}</p>
        {preview.body && <p style={{ background:'#f8fafc', borderRadius:6, padding:12, fontSize:'0.85rem' }}>{preview.body}</p>}

        <div style={{ display:'flex', gap:12, margin:'16px 0' }}>
          {[
            { icon:'📁', val: preview.fileCount,              label:'File' },
            { icon:'🏢', val: preview.organizations?.length,  label:'Organizzazioni' },
            hasWarnings && { icon:'⚠️', val: preview.validation.warnings.length, label:'Warning', bg:'#fef3c7' },
            hasErrors   && { icon:'❌', val: preview.validation.errors.length,   label:'Errori',  bg:'#fee2e2' },
          ].filter(Boolean).map((s, i) => (
            <div key={i} style={{ flex:1, background: s.bg || '#f1f5f9', borderRadius:8, padding:'12px 8px', textAlign:'center' }}>
              <div style={{ fontSize:'1.4rem' }}>{s.icon}</div>
              <div style={{ fontWeight:700, fontSize:'1.2rem' }}>{s.val}</div>
              <div style={{ fontSize:'0.75rem', color:'#6b7280' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom:12 }}>
          <strong>Organizzazioni:</strong>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
            {preview.organizations?.map((org, i) => (
              <span key={i} style={{ background:'#e0e7ff', color:'#3730a3', padding:'2px 10px', borderRadius:12, fontSize:'0.8rem' }}>{org}</span>
            ))}
          </div>
        </div>

        {hasErrors && (
          <div style={{ background:'#fef2f2', borderLeft:'4px solid #dc2626', borderRadius:6, padding:12, marginBottom:12 }}>
            <strong style={{ color:'#991b1b' }}>Errori ({preview.validation.errors.length})</strong>
            <ul style={{ margin:'8px 0 0', paddingLeft:20 }}>
              {preview.validation.errors.map((e, i) => <li key={i} style={{ fontSize:'0.85rem', color:'#991b1b' }}>{e}</li>)}
            </ul>
          </div>
        )}
        {hasWarnings && (
          <div style={{ background:'#fffbeb', borderLeft:'4px solid #d97706', borderRadius:6, padding:12, marginBottom:12 }}>
            <strong style={{ color:'#92400e' }}>Warning ({preview.validation.warnings.length})</strong>
            <ul style={{ margin:'8px 0 0', paddingLeft:20 }}>
              {preview.validation.warnings.map((w, i) => <li key={i} style={{ fontSize:'0.85rem', color:'#92400e' }}>{w}</li>)}
            </ul>
          </div>
        )}
        {hasDuplicates && (
          <div style={{ background:'#fffbeb', borderLeft:'4px solid #d97706', borderRadius:6, padding:12, marginBottom:12 }}>
            <strong style={{ color:'#92400e' }}>EntityID Duplicati ({preview.validation.duplicates.length})</strong>
            <ul style={{ margin:'8px 0 0', paddingLeft:20 }}>
              {preview.validation.duplicates.map((d, i) => <li key={i} style={{ fontSize:'0.85rem' }}><strong>{d.entityID}</strong> — {d.files?.join(', ')}</li>)}
            </ul>
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'flex-end', gap:12, marginTop:20 }}>
          <button onClick={onCancel} disabled={loading} style={{ padding:'10px 20px', borderRadius:6, border:'1px solid #d1d5db', background:'#fff', cursor:'pointer' }}>Annulla</button>
          <button onClick={onConfirm} disabled={loading || hasErrors} style={{ padding:'10px 20px', borderRadius:6, border:'none', background: hasErrors ? '#9ca3af' : '#10b981', color:'#fff', fontWeight:600, cursor: hasErrors ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Creazione in corso...' : 'Conferma e Crea PR'}
          </button>
        </div>
      </div>
    </div>
  );
}
