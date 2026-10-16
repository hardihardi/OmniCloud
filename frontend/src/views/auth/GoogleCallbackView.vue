<script setup>
// custom (custom3): halaman callback Google login — refresh session lalu kembali ke app.
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const status = route.query.google === 'ok' ? 'ok' : 'error';
const message = ref(status === 'ok' ? 'Berhasil masuk dengan Google.' : String(route.query.message || 'Login Google gagal.'));

onMounted(async () => {
	if (status === 'ok') {
		await authStore.refresh?.();
		const redirect = router.currentRoute.value.query.redirect || '/';
		router.replace(String(redirect));
	}
});
</script>

<template>
	<div class="min-h-screen flex items-center justify-center bg-[#f6f8fc] dark:bg-slate-950 px-4">
		<div class="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow px-6 py-8 text-center">
			<template v-if="status === 'ok'">
				<p class="text-sm font-medium text-emerald-600 dark:text-emerald-400">{{ message }}</p>
			</template>
			<template v-else>
				<p class="text-sm font-medium text-red-600 dark:text-red-400">{{ message }}</p>
				<router-link to="/login" class="mt-4 inline-block rounded-full bg-[#1a73e8] px-5 py-2 text-sm font-semibold text-white">Kembali ke login</router-link>
			</template>
		</div>
	</div>
</template>
