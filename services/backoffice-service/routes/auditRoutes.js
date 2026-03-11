import { Router } from 'express';
import { AuditService } from '../services/AuditService.js';
import { authenticate, requireAdmin, requireReviewer } from '../middleware/auth.js';

const router       = Router();
const auditService = new AuditService();

router.get('/', authenticate, requireReviewer, (req, res) => {
  const { page = 1, limit = 50, userId, action, status, from, to } = req.query;
  const result = auditService.list({
    page: parseInt(page), limit: parseInt(limit),
    userId, action, status, from, to
  });
  res.json(result);
});

router.get('/stats', authenticate, requireAdmin, (_, res) => {
  res.json(auditService.stats());
});

export default router;
