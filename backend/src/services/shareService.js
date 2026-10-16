import { randomUUID, randomBytes } from 'node:crypto';
import { db } from '../config/database.js';
import { getFileRowById } from './fileService.js';
import { createAdapter } from './adapterRegistry.js';
import { getAccountById } from './accountService.js';

// custom4: public share links — create/status/revoke + resolve for public access

export function createShareLink(userId, fileId, { expiresInDays = null } = {}) {
	const file = getFileRowById(userId, fileId);
	if (!file || file.deleted_at) {
		const err = new Error('File not found');
		err.status = 404;
		throw err;
	}
	if (file.is_folder) {
		const err = new Error('Folders cannot be shared via link yet');
		err.status = 400;
		throw err;
	}
	// Reuse an active link for the same file if one exists
	const existing = db
		.prepare(
			`SELECT * FROM share_links
			 WHERE user_id = ? AND file_id = ? AND revoked_at IS NULL
			   AND (expires_at IS NULL OR expires_at > datetime('now'))
			 ORDER BY created_at DESC LIMIT 1`,
		)
		.get(userId, fileId);
	if (existing) {
		return { ...existing, reused: true };
	}
	const token = randomBytes(24).toString('base64url');
	const expiresAt = expiresInDays
		? new Date(Date.now() + Number(expiresInDays) * 86400000).toISOString()
		: null;
	const id = randomUUID();
	db.prepare(
		`INSERT INTO share_links (id, user_id, file_id, token, expires_at) VALUES (?, ?, ?, ?, ?)`,
	).run(id, userId, fileId, token, expiresAt);
	return db.prepare('SELECT * FROM share_links WHERE id = ?').get(id);
}

export function getShareStatus(userId, fileId) {
	const rows = db
		.prepare(
			`SELECT * FROM share_links
			 WHERE user_id = ? AND file_id = ? AND revoked_at IS NULL
			   AND (expires_at IS NULL OR expires_at > datetime('now'))
			 ORDER BY created_at DESC LIMIT 1`,
		)
		.all(userId, fileId);
	return rows[0] || null;
}

export function revokeShareLink(userId, fileId) {
	const info = db
		.prepare(
			`UPDATE share_links SET revoked_at = CURRENT_TIMESTAMP
			 WHERE user_id = ? AND file_id = ? AND revoked_at IS NULL`,
		)
		.run(userId, fileId);
	return info.changes > 0;
}

// Resolve a token to a live file context (owner + cloud account + adapter).
// Returns null when the token is unknown, revoked, expired, or the file is trashed.
export function resolveShareToken(token) {
	if (!token || typeof token !== 'string' || token.length < 10) return null;
	const link = db.prepare('SELECT * FROM share_links WHERE token = ?').get(token);
	if (!link || link.revoked_at) return null;
	if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return null;
	const file = db
		.prepare(
			`SELECT fm.*, ca.provider, ca.email, ca.status AS account_status
			 FROM file_metadata fm
			 INNER JOIN cloud_accounts ca ON ca.id = fm.cloud_account_id
			 WHERE fm.id = ? AND fm.deleted_at IS NULL`,
		)
		.get(link.file_id);
	if (!file || file.account_status !== 'active') return null;
	if (file.user_id !== link.user_id) return null;
	const account = getAccountById(file.user_id, file.cloud_account_id);
	if (!account) return null;
	const adapter = createAdapter(account);
	if (!adapter) return null;
	return { link, file, account, adapter };
}

export function isPreviewable(mimeType) {
	const mt = mimeType || 'application/octet-stream';
	return /^(image|video|audio|text)\//.test(mt)
		|| mt === 'application/pdf'
		|| mt === 'application/json';
}
