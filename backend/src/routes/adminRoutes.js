// custom (custom3): login via Google + manajemen super admin.
import { Router } from 'express';
import { env } from '../config/env.js';
import { createSession, clearUserSessions } from '../services/authService.js';
import { listUsers, setUserRole, deleteUser, getUserById } from '../services/userService.js';

const router = Router();

function setAuthCookie(res, token) {
	const options = res.locals.authCookieOptions || {};
	res.cookie(env.authCookieName, token, options);
}

function redirectTo(res, params) {
	const url = new URL(env.frontendUrl + '/auth/google/callback');
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return res.redirect(302, url.toString());
}

// --- Super admin ---
function requireAdmin(req, res, next) {
	if (req.user?.role === 'admin') {
		return next();
	}
	return res.status(403).json({ error: 'Admin access required' });
}

router.get('/admin/users', requireAppUserCompat, requireAdmin, (req, res) => {
	res.json({ data: listUsers() });
});

function requireAppUserCompat(req, res, next) {
	if (req.user) return next();
	return res.status(401).json({ error: 'Authentication required' });
}

router.patch('/admin/users/:id/role', requireAppUserCompat, requireAdmin, (req, res) => {
	const role = String(req.body?.role || '');
	if (!['user', 'admin'].includes(role)) {
		return res.status(400).json({ error: 'Role must be user or admin' });
	}
	if (req.params.id === req.user.id && role !== 'admin') {
		return res.status(400).json({ error: 'Cannot demote yourself' });
	}
	const user = setUserRole(req.params.id, role);
	if (!user) return res.status(404).json({ error: 'User not found' });
	res.json({ data: { id: user.id, email: user.email, role: user.role } });
});

router.delete('/admin/users/:id', requireAppUserCompat, requireAdmin, (req, res) => {
	if (req.params.id === req.user.id) {
		return res.status(400).json({ error: 'Cannot delete yourself' });
	}
	const target = getUserById(req.params.id);
	if (!target) return res.status(404).json({ error: 'User not found' });
	if (target.is_local) return res.status(400).json({ error: 'Cannot delete the local system user' });
	clearUserSessions(target.id);
	deleteUser(target.id);
	res.json({ data: { success: true } });
});

export default router;
