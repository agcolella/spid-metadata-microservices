import { Router } from 'express';
import { UserService }  from '../services/UserService.js';
import { TokenService } from '../services/TokenService.js';
import { AuditService } from '../services/AuditService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router       = Router();
const userService  = new UserService();
const tokenService = new TokenService();
const auditService = new AuditService();

router.use(authenticate, requireAdmin);

const ip = (req) => req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress;
const ua = (req) => req.headers['user-agent'];

router.get('/', (req, res) => {
  const { page = 1, limit = 20, role, active, search } = req.query;
  const result = userService.list({
    page:   parseInt(page),
    limit:  parseInt(limit),
    role,
    active: active !== undefined ? active === 'true' : undefined,
    search
  });
  res.json(result);
});

router.get('/:id', (req, res) => {
  const user = userService.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utente non trovato' });
  res.json(user);
});

router.post('/', (req, res) => {
  try {
    const user = userService.create(req.body);

    auditService.log({
      userId: req.user.sub, username: req.user.username,
      action: 'create_user',
      resource: user.id,
      details: { username: user.username, role: user.role },
      ip: ip(req), userAgent: ua(req)
    });

    res.status(201).json(user);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    if (req.params.id === req.user.sub && req.body.active === false)
      return res.status(400).json({ error: 'Non puoi disattivare il tuo stesso account' });

    const user = userService.update(req.params.id, req.body);

    auditService.log({
      userId: req.user.sub, username: req.user.username,
      action: 'update_user',
      resource: req.params.id,
      details: req.body,
      ip: ip(req), userAgent: ua(req)
    });

    res.json(user);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/reset-password', (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'newPassword obbligatoria' });

    userService.resetPassword(req.params.id, newPassword);
    tokenService.revokeAllUserTokens(req.params.id);

    auditService.log({
      userId: req.user.sub, username: req.user.username,
      action: 'reset_password', resource: req.params.id,
      ip: ip(req), userAgent: ua(req)
    });

    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    if (req.params.id === req.user.sub)
      return res.status(400).json({ error: 'Non puoi eliminare il tuo stesso account' });

    userService.delete(req.params.id);
    tokenService.revokeAllUserTokens(req.params.id);

    auditService.log({
      userId: req.user.sub, username: req.user.username,
      action: 'delete_user', resource: req.params.id,
      ip: ip(req), userAgent: ua(req)
    });

    res.json({ deleted: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
