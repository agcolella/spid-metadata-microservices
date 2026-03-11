import { Router } from 'express';
import { UserService }  from '../services/UserService.js';
import { TokenService } from '../services/TokenService.js';
import { AuditService } from '../services/AuditService.js';
import { authenticate } from '../middleware/auth.js';

const router       = Router();
const userService  = new UserService();
const tokenService = new TokenService();
const auditService = new AuditService();

const ip = (req) => req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress;
const ua = (req) => req.headers['user-agent'];

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'username e password obbligatori' });

  const user = userService.verifyCredentials(username, password);

  if (!user) {
    auditService.log({
      username, action: 'login', status: 'failure',
      details: { reason: 'Credenziali non valide' }, ip: ip(req), userAgent: ua(req)
    });
    return res.status(401).json({ error: 'Credenziali non valide' });
  }

  userService.updateLastLogin(user.id);

  const accessToken  = tokenService.generateAccessToken(user);
  const refreshToken = tokenService.generateRefreshToken(user.id);

  auditService.log({
    userId: user.id, username: user.username,
    action: 'login', status: 'success', ip: ip(req), userAgent: ua(req)
  });

  res.json({ accessToken, refreshToken, user });
});

router.post('/refresh', (req, res) => {
  const { userId, refreshToken } = req.body;
  if (!userId || !refreshToken)
    return res.status(400).json({ error: 'userId e refreshToken obbligatori' });

  const tokenRow = tokenService.verifyRefreshToken(userId, refreshToken);
  if (!tokenRow)
    return res.status(401).json({ error: 'Refresh token non valido o scaduto' });

  const user = userService.findById(userId);
  if (!user || !user.active)
    return res.status(401).json({ error: 'Utente non attivo' });

  tokenService.revokeRefreshToken(tokenRow.id);
  const newAccessToken  = tokenService.generateAccessToken(user);
  const newRefreshToken = tokenService.generateRefreshToken(user.id);

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

router.post('/logout', authenticate, (req, res) => {
  tokenService.revokeAllUserTokens(req.user.sub);

  auditService.log({
    userId: req.user.sub, username: req.user.username,
    action: 'logout', status: 'success', ip: ip(req), userAgent: ua(req)
  });

  res.json({ success: true });
});

router.get('/me', authenticate, (req, res) => {
  const user = userService.findById(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Utente non trovato' });
  res.json(user);
});

router.put('/me/password', authenticate, (req, res) => {
  try {
    const result = userService.changePassword(req.user.sub, req.body);
    tokenService.revokeAllUserTokens(req.user.sub);

    auditService.log({
      userId: req.user.sub, username: req.user.username,
      action: 'change_password', status: 'success', ip: ip(req), userAgent: ua(req)
    });

    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
