// services/backoffice-service/routes/authRoutes.js
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

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'username e password obbligatori' });

  const user = await userService.verifyCredentials(username, password);

  if (!user) {
    await auditService.log({
      username, action: 'login', status: 'failure',
      details: { reason: 'Credenziali non valide' }, ip: ip(req), userAgent: ua(req)
    });
    return res.status(401).json({ error: 'Credenziali non valide' });
  }

  await userService.updateLastLogin(user.id);

  const accessToken  = tokenService.generateAccessToken(user);
  const refreshToken = await tokenService.generateRefreshToken(user.id);

  await auditService.log({
    userId: user.id, username: user.username,
    action: 'login', status: 'success', ip: ip(req), userAgent: ua(req)
  });

  // Se l\'utente deve cambiare password, segnalalo nel payload
  // Il frontend mostra la schermata di cambio password obbligatorio
  res.json({
    accessToken,
    refreshToken,
    user,
    mustChangePassword: user.must_change_password === 1
  });
});

router.post('/spid-login', async (req, res) => {
  const { fiscalNumber, name, familyName, email, spidLevel } = req.body;

  if (!fiscalNumber)
    return res.status(400).json({ error: 'fiscalNumber obbligatorio' });

  try {
    // Trova o crea l'utente locale mappato sul codice fiscale
    let user = await userService.findByFiscalNumber(fiscalNumber);
    if (!user) {
      user = await userService.createFromSpid({ fiscalNumber, name, familyName, email });
    }

    if (!user.active)
      return res.status(403).json({ error: 'Utente disabilitato' });

    await userService.updateLastLogin(user.id);

    const accessToken  = tokenService.generateAccessToken(user);
    const refreshToken = await tokenService.generateRefreshToken(user.id);

    await auditService.log({
      userId: user.id, username: user.username,
      action: 'spid_login', status: 'success',
      details: { spidLevel: spidLevel || null }, ip: ip(req), userAgent: ua(req)
    });

    // Risponde con JSON — è lo spid-service che fa il redirect al frontend
    return res.json({
      accessToken,
      refreshToken,
      mustChangePassword: user.must_change_password === 1,
    });

  } catch (e) {
    console.error('[spid-login] errore:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

router.post('/refresh', async (req, res) => {
  const { userId, refreshToken } = req.body;
  if (!userId || !refreshToken)
    return res.status(400).json({ error: 'userId e refreshToken obbligatori' });

  const tokenRow = await tokenService.verifyRefreshToken(userId, refreshToken);
  if (!tokenRow)
    return res.status(401).json({ error: 'Refresh token non valido o scaduto' });

  const user = await userService.findById(userId);
  if (!user || !user.active)
    return res.status(401).json({ error: 'Utente non attivo' });

  await tokenService.revokeRefreshToken(tokenRow.id);
  const newAccessToken  = tokenService.generateAccessToken(user);
  const newRefreshToken = await tokenService.generateRefreshToken(user.id);

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

router.post('/logout', authenticate, async (req, res) => {
  await tokenService.revokeAllUserTokens(req.user.sub);

  await auditService.log({
    userId: req.user.sub, username: req.user.username,
    action: 'logout', status: 'success', ip: ip(req), userAgent: ua(req)
  });

  res.json({ success: true });
});

router.get('/me', authenticate, async (req, res) => {
  const user = await userService.findById(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Utente non trovato' });
  res.json(user);
});

router.put('/me/password', authenticate, async (req, res) => {
  try {
    const result = await userService.changePassword(req.user.sub, req.body);
    await tokenService.revokeAllUserTokens(req.user.sub);

    await auditService.log({
      userId: req.user.sub, username: req.user.username,
      action: 'change_password', status: 'success', ip: ip(req), userAgent: ua(req)
    });

    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;