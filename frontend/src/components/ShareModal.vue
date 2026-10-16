<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconX, IconCopy, IconCheck, IconLink, IconLoader, IconTrash } from '@tabler/icons-vue';
import { api } from '../services/api.js';
import { formatBytes } from '../composables/useFormatFile.js';

// custom4: Share via public link — create/copy/revoke
const props = defineProps({
	file: { type: Object, default: null },
	isOpen: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'shared-changed']);

const { t } = useI18n();

const isLoading = ref(false);
const isWorking = ref(false);
const shareInfo = ref(null);
const error = ref('');
const copied = ref(false);
const expiryDays = ref('');

const isVisible = computed(() => Boolean(props.isOpen && props.file));
const fileName = computed(() => props.file?.name || props.file?.file_name || '');
const fileSize = computed(() => (props.file?.is_folder ? '' : formatBytes(props.file?.size)));

async function loadStatus() {
	if (!props.file?.id) return;
	isLoading.value = true;
	error.value = '';
	try {
		shareInfo.value = await api.getShareStatus(props.file.id);
	} catch (e) {
		error.value = e.message || t('share.loadFailed');
	} finally {
		isLoading.value = false;
	}
}

async function createLink() {
	isWorking.value = true;
	error.value = '';
	try {
		const body = {};
		const days = Number(expiryDays.value);
		if (days > 0) body.expiresInDays = days;
		shareInfo.value = await api.createShareLink(props.file.id, body);
		emit('shared-changed', { fileId: props.file.id, shared: true });
	} catch (e) {
		error.value = e.message || t('share.createFailed');
	} finally {
		isWorking.value = false;
	}
}

async function revokeLink() {
	isWorking.value = true;
	error.value = '';
	try {
		await api.revokeShareLink(props.file.id);
		shareInfo.value = { shared: false };
		emit('shared-changed', { fileId: props.file.id, shared: false });
	} catch (e) {
		error.value = e.message || t('share.revokeFailed');
	} finally {
		isWorking.value = false;
	}
}

async function copyLink() {
	if (!shareInfo.value?.url) return;
	try {
		await navigator.clipboard.writeText(shareInfo.value.url);
		copied.value = true;
		setTimeout(() => { copied.value = false; }, 1800);
	} catch {
		error.value = t('share.copyFailed');
	}
}

function onBackdropClick() {
	emit('close');
}

function onClose() {
	emit('close');
}

defineExpose({ loadStatus });
</script>

<template>
	<div v-if="isVisible" class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:px-4" @click="onBackdropClick">
		<div class="w-full max-w-md rounded-t-[28px] bg-white p-6 text-[#202124] shadow-[0_24px_60px_rgba(32,33,36,0.28)] dark:bg-slate-800 dark:text-slate-100 sm:rounded-[28px]" @click.stop role="dialog" aria-modal="true" :aria-label="t('share.title')">
			<div class="flex items-start justify-between gap-4">
				<div class="flex items-center gap-3">
					<span class="grid size-10 shrink-0 place-items-center rounded-full bg-[#e8f0fe] text-[#1a73e8] dark:bg-slate-700">
						<IconLink :size="20" :stroke="2" />
					</span>
					<div class="min-w-0">
						<h3 class="text-lg font-semibold leading-tight">{{ t('share.title') }}</h3>
						<p class="mt-0.5 truncate text-xs text-[#5f6368] dark:text-slate-400">{{ fileName }}<span v-if="fileSize"> · {{ fileSize }}</span></p>
					</div>
				</div>
				<button type="button" class="grid size-9 shrink-0 place-items-center rounded-full text-[#5f6368] hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/8" :aria-label="t('common.close')" @click="onClose">
					<IconX :size="18" :stroke="2" />
				</button>
			</div>

			<div v-if="isLoading" class="mt-8 flex items-center justify-center gap-2 py-6 text-sm text-[#5f6368] dark:text-slate-400">
				<IconLoader :size="18" class="animate-spin" />
				{{ t('common.loading') }}
			</div>

			<template v-else>
				<!-- Belum dibagikan -->
				<div v-if="!shareInfo?.shared" class="mt-6">
					<p class="text-sm text-[#5f6368] dark:text-slate-400">{{ t('share.notSharedDesc') }}</p>
					<label class="mt-5 block text-sm font-medium" for="share-expiry">{{ t('share.expiryLabel') }}</label>
					<select id="share-expiry" v-model="expiryDays" class="mt-2 w-full rounded-xl border border-[#e0e3e7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1a73e8] dark:border-slate-600 dark:bg-slate-900">
						<option value="">{{ t('share.expiryNever') }}</option>
						<option value="1">{{ t('share.expiry1d') }}</option>
						<option value="7">{{ t('share.expiry7d') }}</option>
						<option value="30">{{ t('share.expiry30d') }}</option>
					</select>
					<button type="button" class="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#1a73e8] text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:cursor-not-allowed disabled:opacity-60" :disabled="isWorking" @click="createLink">
						<IconLoader v-if="isWorking" :size="16" class="animate-spin" />
						{{ t('share.createButton') }}
					</button>
				</div>

				<!-- Sudah dibagikan -->
				<div v-else class="mt-6">
					<div class="rounded-2xl border border-[#e0e3e7] bg-[#f8fafd] p-4 dark:border-slate-600 dark:bg-slate-900/60">
						<p class="text-xs font-medium uppercase tracking-wider text-[#5f6368] dark:text-slate-400">{{ t('share.linkLabel') }}</p>
						<div class="mt-2 flex items-center gap-2">
							<input type="text" readonly :value="shareInfo.url" class="min-w-0 flex-1 rounded-lg border border-[#e0e3e7] bg-white px-3 py-2 font-mono text-xs outline-none dark:border-slate-600 dark:bg-slate-900" :aria-label="t('share.linkLabel')" @focus="$event.target.select()" />
							<button type="button" class="grid size-10 shrink-0 place-items-center rounded-full bg-[#1a73e8] text-white transition hover:bg-[#1765cc]" :aria-label="t('share.copy')" @click="copyLink">
								<IconCheck v-if="copied" :size="18" :stroke="2" />
								<IconCopy v-else :size="18" :stroke="2" />
							</button>
						</div>
						<p v-if="shareInfo.expiresAt" class="mt-2 text-xs text-[#5f6368] dark:text-slate-400">{{ t('share.expiresAt') }} {{ new Date(shareInfo.expiresAt).toLocaleString() }}</p>
					</div>
					<button type="button" class="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#dadce0] text-sm font-medium text-[#d93025] transition hover:bg-[#fce8e6] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:hover:bg-red-900/30" :disabled="isWorking" @click="revokeLink">
						<IconLoader v-if="isWorking" :size="16" class="animate-spin" />
						<IconTrash v-else :size="16" :stroke="2" />
						{{ t('share.revokeButton') }}
					</button>
				</div>

				<p v-if="error" class="mt-4 rounded-xl bg-[#fce8e6] px-3 py-2 text-xs text-[#c5221f] dark:bg-red-900/40 dark:text-red-300" role="alert">{{ error }}</p>
			</template>
		</div>
	</div>
</template>
