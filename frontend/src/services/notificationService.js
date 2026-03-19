class NotificationService {
  constructor() { this.container = null; this.notifications = []; this.init(); }
  init() {
    if (!document.getElementById('notification-container')) {
      this.container = document.createElement('div');
      this.container.id = 'notification-container';
      this.container.style.cssText = `position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:12px;pointer-events:none;`;
      document.body.appendChild(this.container);
    } else {
      this.container = document.getElementById('notification-container');
    }
  }
  show(message, type = 'info', duration = 5000) {
    const icons = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const colors = {
      success: { bg:'#d1fae5', border:'#10b981', text:'#065f46' },
      error:   { bg:'#fee2e2', border:'#ef4444', text:'#991b1b' },
      warning: { bg:'#fef3c7', border:'#f59e0b', text:'#92400e' },
      info:    { bg:'#dbeafe', border:'#3b82f6', text:'#1e40af' }
    };
    const color = colors[type] || colors.info;
    const el = document.createElement('div');
    el.style.cssText = `background:${color.bg};color:${color.text};border-left:4px solid ${color.border};padding:16px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);min-width:300px;max-width:500px;display:flex;align-items:center;gap:12px;font-size:.95rem;font-weight:500;pointer-events:auto;cursor:pointer;animation:slideIn .3s ease-out;`;
    el.innerHTML = `<span style="font-size:1.4rem;flex-shrink:0;">${icons[type]}</span><span style="flex:1;line-height:1.4;">${message}</span><span style="font-size:1.2rem;opacity:.6;flex-shrink:0;">×</span>`;
    if (!document.getElementById('notification-styles')) {
      const s = document.createElement('style'); s.id='notification-styles';
      s.textContent=`@keyframes slideIn{from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(400px);opacity:0}}`;
      document.head.appendChild(s);
    }
    let tid;
    el.onclick = () => this.remove(el);
    el.onmouseenter = () => clearTimeout(tid);
    el.onmouseleave = () => { tid = setTimeout(() => this.remove(el), 2000); };
    this.container.appendChild(el);
    tid = setTimeout(() => this.remove(el), duration);
  }
  remove(el) {
    el.style.animation = 'slideOut .3s ease-out';
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
  }
  success(m, d) { this.show(m, 'success', d); }
  error(m, d)   { this.show(m, 'error', d); }
  warning(m, d) { this.show(m, 'warning', d); }
  info(m, d)    { this.show(m, 'info', d); }
}
export const notify = new NotificationService();
