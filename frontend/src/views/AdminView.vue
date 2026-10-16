<script setup>
// custom (custom3): panel super admin — kelola user & role.
import { onMounted, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconTrash, IconShieldCheck, IconShieldOff, IconLoader2 } from '@tabler/icons-vue';
import DriveShell from '../components/DriveShell.vue';
import { adminApi } from '../services/api';
import { useAuthStore } from '../stores/auth';

const { t } = useI18n();
const authStore = useAuthStore();
const users = ref([]);
const loading = ref(true);
const errorMessage = ref('');
const successMessage = ref('');

const isAdmin = computed(() => authStore.user?.role === 'admin');

async function loadUsers() {
	loading.value = true;
	errorMessage.value = '';
	try {
		const { data } = await adminApi.listUsers();
		users.value = Array.isArray(data) ? data : [];
	} catch (error) {
		errorMessage.value = error.message || 'Gagal memuat user';
	} finally {
		loading.value = false;
	}
}

async function toggleRole(user) {
	successMessage.value = '';
	errorMessage.value = '';
	try {
		await adminApi.setUserRole(user.id, user.role === 'admin' ? 'user' : 'admin');
		successMessage.value = `Role ${user.email} diperbarui`;
		await loadUsers();
	} catch (error) {
		errorMessage.value = error.message || 'Gagal mengubah role';
	}
}

async function removeUser(user) {
	if (!window.confirm(`Hapus ${user.email}? Tindakan ini permanen.`)) return;
	successMessage.value = '';
	errorMessage.value = '';
	try {
		await adminApi.deleteUser(user.id);
		successMessage.value = `${user.email} dihapus`;
		await loadUsers();
	} catch (error) {
		errorMessage.value = error.message || 'Gagal menghapus user';
	}
}

onMounted(loadUsers);
</script>

<template>
	<DriveShell current-section="admin">
		<div class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
			<header class="mb-5">
				<h1 class="text-xl font-semibold text-[#202124] dark:text-slate-100 sm:text-2xl">Admin — Manajemen User</h1>
				<p class="mt-1 text-sm text-[#5f6368] dark:text-slate-400">Kelola akun dan role pengguna OmniCloud.</p>
			</header>

			<p v-if="!isAdmin" class="rounded-2xl bg-[#fce8e6] px-4 py-3 text-sm text-[#c5221f] dark:bg-red-950/40 dark:text-red-300" role="alert">
				Halaman ini khusus super admin.
			</p>

			<template v-else>
				<p v-if="successMessage" class="mb-3 rounded-2xl bg-[#e6f4ea] px-4 py-3 text-sm text-[#137333] dark:bg-emerald-950/40 dark:text-emerald-300" role="status">{{ successMessage }}</p>
				<p v-if="errorMessage" class="mb-3 rounded-2xl bg-[#fce8e6] px-4 py-3 text-sm text-[#c5221f] dark:bg-red-950/40 dark:text-red-300" role="alert">{{ errorMessage }}</p>

				<div v-if="loading" class="flex items-center justify-center gap-2 py-10 text-sm text-[#5f6368] dark:text-slate-400">
					<IconLoader2 :size="18" class="animate-spin" /> Memuat…
				</div>

				<div v-else class="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
					<table class="w-full text-left text-sm">
						<thead class="bg-black/[0.03] text-xs uppercase tracking-wide text-[#5f6368] dark:bg-slate-800/60 dark:text-slate-400">
							<tr>
								<th class="px-4 py-3 font-semibold">Email</th>
								<th class="px-4 py-3 font-semibold">Role</th>
								<th class="px-4 py-3 font-semibold">Dibuat</th>
								<th class="px-4 py-3 font-semibold text-right">Aksi</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-black/5 dark:divide-slate-800">
							<tr v-for="user in users" :key="user.id" class="text-[#202124] dark:text-slate-200">
								<td class="max-w-[220px] truncate px-4 py-3" :title="user.email">{{ user.email }}</td>
								<td class="px-4 py-3">
									<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="user.role === 'admin' ? 'bg-[#e8f0fe] text-[#1a73e8] dark:bg-sky-950 dark:text-sky-300' : 'bg-black/5 text-[#5f6368] dark:bg-slate-800 dark:text-slate-400'">
										{{ user.role }}
									</span>
								</td>
								<td class="px-4 py-3 text-xs text-[#5f6368] dark:text-slate-400">{{ user.created_at?.slice(0, 10) }}</td>
								<td class="px-4 py-3">
									<div class="flex justify-end gap-2">
										<button type="button" class="inline-flex size-9 items-center justify-center rounded-full transition hover:bg-[#e8f0fe] dark:hover:bg-sky-950/60" :title="user.role === 'admin' ? 'Jadikan user' : 'Jadikan admin'" @click="toggleRole(user)">
											<IconShieldCheck v-if="user.role !== 'admin'" :size="18" />
											<IconShieldOff v-else :size="18" />
										</button>
										<button v-if="user.id !== authStore.user?.id && !user.is_local" type="button" class="inline-flex size-9 items-center justify-center rounded-full transition hover:bg-[#fce8e6] dark:hover:bg-red-950/60" title="Hapus user" @click="removeUser(user)">
											<IconTrash :size="18" />
										</button>
									</div>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</template>
		</div>
	</DriveShell>
</template>
