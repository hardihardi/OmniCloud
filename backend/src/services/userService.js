import { randomUUID } from 'crypto';
import { db, LOCAL_USER_EMAIL, LOCAL_USER_ID } from '../config/database.js';

function mapUser(row) {
	if (!row) return null;
	return {
		...row,
		is_local: Boolean(row.is_local),
	};
}

export function getUserById(id) {
	return mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

export function getUserByEmail(email) {
	return mapUser(db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email));
}

export function createUser({ email, passwordHash, isLocal = false, id = randomUUID(), role = 'user', displayName = '' }) {
	db.prepare(`
		INSERT INTO users (id, email, password_hash, is_local, role, display_name)
		VALUES (?, ?, ?, ?, ?, ?)
	`).run(id, email.trim().toLowerCase(), passwordHash, isLocal ? 1 : 0, role, displayName);

	return getUserById(id);
}

// custom (custom3): role admin / manajemen user
export function setUserRole(userId, role) {
	db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, userId);
	return getUserById(userId);
}

export function listUsers() {
	return db.prepare('SELECT id, email, role, is_local, created_at FROM users ORDER BY created_at ASC').all()
		.map((row) => ({ ...row, is_local: Boolean(row.is_local) }));
}

export function deleteUser(userId) {
	db.prepare('DELETE FROM users WHERE id = ? AND is_local = 0').run(userId);
}

export function getOrCreateLocalUser() {
	const existing = getUserById(LOCAL_USER_ID);
	if (existing) return existing;

	return createUser({
		id: LOCAL_USER_ID,
		email: LOCAL_USER_EMAIL,
		passwordHash: '',
		isLocal: true,
	});
}

export function serializeUser(user) {
	if (!user) return null;
	return {
		id: user.id,
		email: user.email,
		isLocal: Boolean(user.is_local),
		role: user.role || 'user',
		displayName: user.display_name || '',
	};
}