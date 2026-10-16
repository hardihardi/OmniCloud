// custom (custom3): Google Sign-In — login/register user via Google OAuth (tanpa Drive scope).
// Terpisah dari googleOAuthService (connect Drive) supaya scope tidak tercampur.
import { randomUUID } from 'crypto';
import { google } from 'googleapis';
import { env } from '../config/env.js';
import { db } from '../config/database.js';
import { createUser, getUserByEmail } from './userService.js';
import { SUPER_ADMIN_EMAILS } from './superAdmins.js';

const loginStates = new Map();

export function getGoogleLoginStatus() {
	return {
		configured: Boolean(env.googleClientId && env.googleClientSecret),
		authorizationUrl: null,
	};
}

function createLoginOAuthClient() {
	if (!env.googleClientId || !env.googleClientSecret) {
		throw new Error('Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env');
	}
	return new google.auth.OAuth2(env.googleClientId, env.googleClientSecret, env.googleRedirectUri);
}

export function createGoogleLoginRequest() {
	const oauthClient = createLoginOAuthClient();
	const state = randomUUID();
	loginStates.set(state, { createdAt: Date.now() });

	// Hapus state kadaluarsa (>15 menit)
	const cutoff = Date.now() - 15 * 60 * 1000;
	for (const [key, value] of loginStates) {
		if (value.createdAt < cutoff) loginStates.delete(key);
	}

	const authorizationUrl = oauthClient.generateAuthUrl({
		access_type: 'online',
		prompt: 'select_account',
		scope: ['openid', 'email', 'profile'],
		state,
	});

	return { authorizationUrl, state };
}

function roleForEmail(email) {
	const normalized = String(email || '').trim().toLowerCase();
	return SUPER_ADMIN_EMAILS.has(normalized) ? 'admin' : 'user';
}

export async function completeGoogleLogin({ code, state }) {
	if (!code || !state) {
		throw new Error('Missing Google OAuth code or state');
	}
	const authState = loginStates.get(state);
	if (!authState) {
		throw new Error('Invalid or expired Google OAuth state');
	}
	loginStates.delete(state);

	const oauthClient = createLoginOAuthClient();
	const { tokens } = await oauthClient.getToken(code);

	const ticket = await oauthClient.verifyIdToken({
		idToken: tokens.id_token,
		audience: env.googleClientId,
	});
	const payload = ticket.getPayload();
	if (!payload?.email) {
		throw new Error('Unable to read Google account email');
	}

	const email = payload.email.trim().toLowerCase();
	let user = getUserByEmail(email);
	if (!user) {
		user = createUser({
			email,
			passwordHash: '', // login via Google — tanpa password lokal
			role: roleForEmail(email),
			displayName: payload.name || '',
		});
	} else if (!user.role || user.role === 'user') {
		// Promosi otomatis bila email masuk daftar super admin
		const role = roleForEmail(email);
		if (role === 'admin') {
			db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, user.id);
			user = getUserByEmail(email);
		}
	}

	return user;
}
