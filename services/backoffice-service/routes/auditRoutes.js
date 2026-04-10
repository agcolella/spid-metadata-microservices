// services/backoffice-service/routes/auditRoutes.js
import { Router } from 'express';
import { AuditService } from '../services/AuditService.js';
import { authenticate, requireAdmin, requireReviewer } from '../middleware/auth.js';

const router       = Router();
const auditService = new AuditService();

router.get('/', authenticate, requireReviewer, async (req, res) => {
  const { page = 1, limit = 50, userId, action, status, from, to } = req.query;
  const result = await auditService.list({
    page: parseInt(page), limit: parseInt(limit),
    userId, action, status, from, to
  });
  res.json(result);
});

router.get('/stats', authenticate, requireAdmin, async (_, res) => {
  res.json(await auditService.stats());
});

export default router;
