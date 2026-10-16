<script setup>
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { IconLoader2, IconMail, IconLock } from '@tabler/icons-vue';
import { useAuthStore } from '../../stores/auth';
import AuthLayout from './AuthLayout.vue';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();

const form = reactive({ email: '', password: '' });
// custom (custom3): Google Sign-In — langsung ke endpoint API
const googleUrl = `${(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api')}/auth/google`;
const localError = ref('');

const isBusy = computed(() => authStore.loading);
const displayError = computed(() => localError.value || authStore.error);

async function handleSubmit() {
	localError.value = '';
	authStore.error = null;

	if (!form.email.trim() || !form.password) {
		localError.value = t('auth.errors.required');
		return;
	}

	const ok = await authStore.login({ email: form.email.trim(), password: form.password });
	if (ok) {
		const redirect = router.currentRoute.value.query.redirect || '/';
		router.replace(String(redirect));
	}
}

function goRegister() {
	authStore.error = null;
	router.push({ name: 'register', query: router.currentRoute.value.query });
}
</script>

<template>
	<AuthLayout :title="t('auth.loginTitle')" :subtitle="t('auth.loginSubtitle')">
		<form class="auth-form" @submit.prevent="handleSubmit">
			<label class="auth-field">
				<span class="auth-field__label">{{ t('auth.email') }}</span>
				<span class="auth-field__control">
					<IconMail :size="18" class="auth-field__icon" />
					<input v-model="form.email" type="email" autocomplete="email" :placeholder="t('auth.emailPlaceholder')" required />
				</span>
			</label>

			<label class="auth-field">
				<span class="auth-field__label">{{ t('auth.password') }}</span>
				<span class="auth-field__control">
					<IconLock :size="18" class="auth-field__icon" />
					<input v-model="form.password" type="password" autocomplete="current-password" :placeholder="t('auth.passwordPlaceholder')" required />
				</span>
			</label>

			<Transition name="auth-fade">
				<p v-if="displayError" class="auth-error">{{ displayError }}</p>
			</Transition>

			<button type="submit" class="auth-submit" :disabled="isBusy">
				<IconLoader2 v-if="isBusy" :size="18" class="spin" />
				<span>{{ isBusy ? t('auth.signingIn') : t('auth.loginCta') }}</span>
			</button>
						<div class="auth-divider"><span>atau</span></div>

			<a class="auth-google" :href="googleUrl" aria-label="Masuk dengan Google">
				<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
				<span>Masuk dengan Google</span>
			</a>

		</form>

		<p class="auth-switch">
			{{ t('auth.noAccount') }}
			<button type="button" @click="goRegister">{{ t('auth.registerCta') }}</button>
		</p>
	</AuthLayout>
</template>

<style scoped src="./auth-form.css"></style>
