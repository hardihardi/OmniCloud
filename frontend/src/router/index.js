import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import MyDriveView from '../views/MyDriveView.vue';
import RecentView from '../views/RecentView.vue';
import SharedWithMeView from '../views/SharedWithMeView.vue';
import StarredView from '../views/StarredView.vue';
import TrashView from '../views/TrashView.vue';
import QuotaView from '../views/QuotaView.vue';
import LoginView from '../views/auth/LoginView.vue';
import RegisterView from '../views/auth/RegisterView.vue';
import GoogleCallbackView from '../views/auth/GoogleCallbackView.vue';
import AdminView from '../views/AdminView.vue';
import { useAuthStore } from '../stores/auth';

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: '/login',
			name: 'login',
			component: LoginView,
			meta: { public: true },
		},
		{
			path: '/register',
			name: 'register',
			component: RegisterView,
			meta: { public: true },
		},
		{
			path: '/auth/google/callback',
			name: 'google-callback',
			component: GoogleCallbackView,
			meta: { public: true },
		},
		{
			path: '/admin',
			name: 'admin',
			component: AdminView,
			meta: { adminOnly: true },
		},
		{
			path: '/',
			name: 'home',
			component: HomeView,
		},
		{
			path: '/my-drive',
			name: 'my-drive',
			component: MyDriveView,
		},
		{
			path: '/shared-with-me',
			name: 'shared-with-me',
			component: SharedWithMeView,
		},
		{
			path: '/recent',
			name: 'recent',
			component: RecentView,
		},
		{
			path: '/starred',
			name: 'starred',
			component: StarredView,
		},
		{
			path: '/trash',
			name: 'trash',
			component: TrashView,
		},
		{
			path: '/quota',
			name: 'quota',
			component: QuotaView,
		},
	],
});

router.beforeEach(async (to) => {
	const authStore = useAuthStore();
	await authStore.bootstrap();

	if (!authStore.requiresAuth) {
		if (to.meta.public) {
			return { path: '/' };
		}
		return true;
	}

	if (to.meta.public) {
		return authStore.authenticated ? { path: '/' } : true;
	}

	if (!authStore.authenticated) {
		return { path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } };
	}

	if (to.meta.adminOnly && authStore.user?.role !== 'admin') {
		return { path: '/' };
	}

	return true;
});

export default router;
