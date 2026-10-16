import { Router } from 'express';
import { requireAppUser } from '../middleware/authMiddleware.js';
import { env } from '../config/env.js';
import { createShareLink, getShareStatus, revokeShareLink } from '../services/shareService.js';

// custom4: authenticated share-link management (public access lives in shareRoutes.js)
const router = Router();
router.use(requireAppUser);

function sharePayload(req, link) {
	if (!link) return { shared: false };
	const proto = req.headers['x-forwarded-proto'];
	const host = req.headers['x-forwarded-host'];
	const origin = (proto && host) ? `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}` : env.frontendUrl;
	return {
		shared: true,
		token: link.token,
		url: `${origin}/s/${link.token}`,
		createdAt: link.created_at,
		expiresAt: link.expires_at || null,
	};
}

// Status of the share link for a file
router.get('/files/:id/share', async (req, res, next) => {
	try {
		const link = getShareStatus(req.user.id, req.params.id);
		return res.json(sharePayload(req, link));
	} catch (error) {
		return next(error);
	}
});

// Create (or return existing) share link
router.post('/files/:id/share', async (req, res, next) => {
	try {
		const expiresInDays = req.body?.expiresInDays ?? null;
		const link = createShareLink(req.user.id, req.params.id, { expiresInDays });
		return res.status(link.reused ? 200 : 201).json(sharePayload(req, link));
	} catch (error) {
		return next(error);
	}
});

// Revoke share link
router.delete('/files/:id/share', async (req, res, next) => {
	try {
		const ok = revokeShareLink(req.user.id, req.params.id);
		if (!ok) {
			return res.status(404).json({ error: 'No active share link for this file' });
		}
		return res.json({ shared: false });
	} catch (error) {
		return next(error);
	}
});

export default router;
