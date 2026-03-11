export class PRTemplateService {
  constructor(config) { this.config = config; }

  generateTitle(fileCount, organizations) {
    const template = this.config.prTemplate?.title || 'SPID: Aggiunta {count} metadata - {date}';
    const dateStr  = new Date().toISOString().split('T')[0];
    return template
      .replace('{count}', fileCount)
      .replace('{date}', dateStr)
      .replace('{organizations}', organizations.length);
  }

  generateBody(filesData, organizations, validationResults) {
    if (this.config.prTemplate?.body) return this.config.prTemplate.body;

    const { errors = [], warnings = [], duplicates = [] } = validationResults || {};

    let body = '## 📋 Riepilogo\n\n';
    body += `Questa PR aggiunge **${filesData.length}** metadata SPID per **${organizations.length}** organizzazioni.\n\n`;

    body += '## ✅ Validazione\n\n';
    if (!errors.length && !warnings.length && !duplicates.length) {
      body += '- ✅ Tutti i file sono validi\n- ✅ Nessun warning\n- ✅ Nessun entityID duplicato\n\n';
    } else {
      if (errors.length)     body += `- ⚠️ **${errors.length}** errori\n`;
      if (warnings.length)   body += `- ⚠️ **${warnings.length}** warning\n`;
      if (duplicates.length) body += `- ⚠️ **${duplicates.length}** entityID duplicati\n`;
      body += '\n';
    }

    body += '## 🏢 Organizzazioni\n\n';
    organizations.forEach(o => { body += `- ${o}\n`; });
    body += '\n';

    body += '## 📁 File Inclusi\n\n<details>\n<summary>Espandi lista</summary>\n\n';
    filesData.forEach(f => {
      body += `- \`${f.filename}\`` + (f.organizationName ? ` — ${f.organizationName}` : '') + '\n';
    });
    body += '\n</details>\n\n---\n*PR creata automaticamente da SPID Metadata App*\n';
    return body;
  }

  generateBranchName() {
    const prefix  = this.config.branchPrefix || 'spid-batch-';
    const random  = Math.random().toString(36).substring(2, 8);
    return `${prefix}${Date.now()}-${random}`;
  }
}
