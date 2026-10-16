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
		</form>

		<p class="auth-switch">
			{{ t('auth.noAccount') }}
			<button type="button" @click="goRegister">{{ t('auth.registerCta') }}</button>
		</p>
	</AuthLayout>
</template>

<style scoped src="./auth-form.css"></style>
