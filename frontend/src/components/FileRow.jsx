import React from 'react';
import { ValidationBadge } from './ValidationBadge';

const S = {
  th: { padding: '10px 12px', background: '#f1f5f9', textAlign: 'left', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none', fontSize: '0.85rem' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' },
};

export function FileRow({ file, isExpanded, isValidating, onToggle }) {
  return (
    <tr
      onClick={() => onToggle(file.filename)}
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
            : <span style={{ color: '#9ca3af' }}>N/A</span>}
        </span>
      </td>
      <td style={S.td}>
        {file.creationDate ? new Date(file.creationDate).toLocaleDateString('it-IT') : 'N/A'}
      </td>
      <td style={S.td}>
        {isValidating
          ? <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>⟳ validazione...</span>
          : <ValidationBadge validation={file.validation} />}
      </td>
    </tr>
  );
}
