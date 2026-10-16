// custom (custom3): seed super admin saat boot — bila SUPER_ADMIN_EMAIL & SUPER_ADMIN_PASSWORD diset.
import { getUserByEmail, createUser, setUserRole } from '../services/userService.js';
import { hashPassword } from '../services/authService.js';
import { SUPER_ADMIN_EMAILS } from '../services/superAdmins.js';

export function ensureSuperAdmin() {
	const email = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
	const password = process.env.SUPER_ADMIN_PASSWORD || '';
	if (!email || !password) return null;
	if (email.includes('@') === false) return null;

	let user = getUserByEmail(email);
	if (!user) {
		user = createUser({ email, passwordHash: hashPassword(password), role: 'admin' });
	} else if (user.role !== 'admin') {
		user = setUserRole(user.id, 'admin');
	}
	SUPER_ADMIN_EMAILS.add(email);
	return { id: user.id, email: user.email, role: 'admin' };
}
