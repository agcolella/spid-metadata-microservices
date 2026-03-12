import { TokenService } from '../services/TokenService.js';
import { ROLES } from '../services/UserService.js';

const tokenService = new TokenService();

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token di accesso mancante' });
  }

  try {
    const token = authHeader.split(' ')[1];
    req.user = tokenService.verifyAccessToken(token);
    next();
  } catch (e) {
    const msg = e.name === 'TokenExpiredError' ? 'Token scaduto' : 'Token non valido';
    return res.status(401).json({ error: msg });
  }
}

export function requireRole(minRole) {
  return (req, res, next) => {
    const userLevel = ROLES[req.user?.role]?.level ?? 0;
    const minLevel  = ROLES[minRole]?.level        ?? 999;

    if (userLevel < minLevel) {
      return res.status(403).json({
        error: `Accesso negato. Ruolo richiesto: ${minRole} (hai: ${req.user?.role})`
      });
    }
    next();
  };
}

export const requireAdmin    = requireRole('admin');
export const requireOperator = requireRole('operator');
export const requireReviewer = requireRole('reviewer');
