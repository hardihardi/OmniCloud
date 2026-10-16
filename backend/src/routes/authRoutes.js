import { Router } from 'express';
import { env } from '../config/env.js';
import {
	clearUserSessions,
	createSession,
	destroySession,
	getAuthSummary,
	loginHostedUser,
	registerHostedUser,
} from '../services/authService.js';

const router = Router();

function setAuthCookie(res, token) {
	const options = res.locals.authCookieOptions || {};
	res.cookie(env.authCookieName, token, options);
}

function clearAuthCookie(res) {
	const options = res.locals.authCookieOptions || {};
	res.clearCookie(env.authCookieName, { ...options, maxAge: 0 });
}

router.get('/auth/me', (req, res) => {
	res.json({ data: getAuthSummary(req.user) });
});

router.post('/auth/register', (req, res, next) => {
	try {
		const user = registerHostedUser(req.body || {});
		clearUserSessions(user.id);
		const session = createSession(user.id);
		setAuthCookie(res, session.token);
		res.status(201).json({ data: getAuthSummary(user) });
	} catch (error) {
		next(error);
	}
});

router.post('/auth/login', (req, res, next) => {
	try {
		const user = loginHostedUser(req.body || {});
		const session = createSession(user.id);
		setAuthCookie(res, session.token);
		res.json({ data: getAuthSummary(user) });
	} catch (error) {
		next(error);
	}
});

// custom (custom3): Google Sign-In endpoints — harus terdaftar sebelum router.use(requireAppUser) di fileRoutes
import { createGoogleLoginRequest, completeGoogleLogin, getGoogleLoginStatus } from '../services/googleLoginService.js';

router.get('/auth/google/status', (req, res) => {
	res.json({ data: getGoogleLoginStatus() });
});

router.get('/auth/google', (req, res) => {
	try {
		const { authorizationUrl } = createGoogleLoginRequest();
		return res.redirect(302, authorizationUrl);
	} catch (error) {
		const url = new URL(env.frontendUrl + '/auth/google/callback');
		url.searchParams.set('google', 'error');
		url.searchParams.set('message', error.message);
		return res.redirect(302, url.toString());
	}
});

router.get('/auth/google/callback', async (req, res) => {
	try {
		const { code, state, error } = req.query;
		if (error) {
			const url = new URL(env.frontendUrl + '/auth/google/callback');
			url.searchParams.set('google', 'error');
			url.searchParams.set('message', String(error));
			return res.redirect(302, url.toString());
		}
		const user = await completeGoogleLogin({ code, state });
		clearUserSessions(user.id);
		const session = createSession(user.id);
		setAuthCookie(res, session.token);
		const url = new URL(env.frontendUrl + '/auth/google/callback');
		url.searchParams.set('google', 'ok');
		return res.redirect(302, url.toString());
	} catch (loginError) {
		const url = new URL(env.frontendUrl + '/auth/google/callback');
		url.searchParams.set('google', 'error');
		url.searchParams.set('message', loginError.message);
		return res.redirect(302, url.toString());
	}
});

router.post('/auth/logout', (req, res) => {
	const cookieHeader = req.headers.cookie || '';
	const token = cookieHeader
		.split(';')
		.map((item) => item.trim())
		.find((item) => item.startsWith(`${env.authCookieName}=`))
		?.slice(env.authCookieName.length + 1);

	if (token) {
		destroySession(decodeURIComponent(token));
	}

	clearAuthCookie(res);
	res.json({ data: getAuthSummary(env.appMode === 'local' ? req.user : null) });
});

export default router;