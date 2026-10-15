<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconChevronRight, IconFolder, IconX } from '@tabler/icons-vue';
import { api } from '../services/api';

const { t } = useI18n();

const props = defineProps({
	isOpen: { type: Boolean, required: true },
	mode: { type: String, default: 'move' }, // 'move' | 'copy'
	file: { type: Object, default: null },
});

const emit = defineEmits(['close', 'confirm']);

const foldersByParent = ref({});
const currentPath = ref('/');
const isLoading = ref(false);
const errorMessage = ref('');
const expanded = ref(new Set());

const title = computed(() => (props.mode === 'copy' ? t('drive.copyTitle') : t('drive.moveTitle')));
const confirmLabel = computed(() => (props.mode === 'copy' ? t('drive.copyHere') : t('drive.moveHere')));

watch(() => props.isOpen, async (open) => {
	if (!open) return;
	currentPath.value = '/';
	foldersByParent.value = {};
	errorMessage.value = '';
	await loadFolder('/');
});

async function loadFolder(path) {
	isLoading.value = true;
	errorMessage.value = '';
	try {
		const { data } = await api.listFiles(path);
		const folders = (Array.isArray(data) ? data : []).filter((item) => item.is_folder);
		foldersByParent.value = { ...foldersByParent.value, [path]: folders };
	} catch (error) {
		errorMessage.value = error.message || 'Failed to load folders';
	} finally {
		isLoading.value = false;
	}
}

function openFolder(folder) {
	const parent = folder.virtual_path || '/';
	const inside = `${parent === '/' ? '' : parent}${folder.file_name}/`;
	const next = inside.startsWith('/') ? inside : `/${inside}`;
	expanded.value = new Set([...expanded.value, folder.virtual_path || '/']);
	currentPath.value = next;
	if (!foldersByParent.value[next]) loadFolder(next);
}

function goUp() {
	if (currentPath.value === '/') return;
	const parts = currentPath.value.replace(/\/$/, '').split('/').filter(Boolean);
	parts.pop();
	const next = parts.length ? `/${parts.join('/')}/` : '/';
	currentPath.value = next;
	if (!foldersByParent.value[next]) loadFolder(next);
}

function breadcrumbs() {
	const parts = currentPath.value.replace(/\/$/, '').split('/').filter(Boolean);
	const crumbs = [{ name: t('drive.rootFolder') || 'Root', path: '/' }];
	let acc = '';
	for (const part of parts) {
		acc += `/${part}`;
		crumbs.push({ name: part, path: `${acc}/` });
	}
	return crumbs;
}

function confirmSelection() {
	emit('confirm', { targetPath: currentPath.value });
}
</script>

<template>
	<div v-if="isOpen" class="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" :aria-label="title" @click.self="emit('close')">
		<div class="max-h-[85vh] w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-800 sm:rounded-3xl">
			<div class="flex items-center justify-between border-b border-[#e0e3e7] px-5 py-4 dark:border-slate-700">
				<h2 class="m-0 text-base font-semibold text-[#202124] dark:text-slate-100">{{ title }}</h2>
				<button type="button" class="grid size-9 place-items-center rounded-full text-[#5f6368] transition hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10" :aria-label="t('common.close')" @click="emit('close')">
					<IconX :size="18" :stroke="2" />
				</button>
			</div>

			<p v-if="file" class="truncate px-5 pt-3 text-xs text-[#5f6368] dark:text-slate-400">{{ file.file_name }}</p>

			<div class="flex flex-wrap items-center gap-1 px-5 py-2 text-sm">
				<template v-for="(crumb, index) in breadcrumbs()" :key="crumb.path">
					<button type="button" class="rounded px-1.5 py-0.5 transition hover:bg-black/5 dark:hover:bg-white/10" :class="index === breadcrumbs().length - 1 ? 'font-semibold text-[#1a73e8] dark:text-blue-300' : 'text-[#5f6368] dark:text-slate-400'" @click="currentPath = crumb.path">
						{{ crumb.name }}
					</button>
					<IconChevronRight v-if="index < breadcrumbs().length - 1" :size="14" :stroke="2" class="text-[#5f6368] dark:text-slate-500" />
				</template>
			</div>

			<div class="custom-scrollbar max-h-[45vh] min-h-[160px] overflow-y-auto px-5 pb-2">
				<div v-if="isLoading" class="py-6 text-center text-sm text-[#5f6368] dark:text-slate-400">{{ t('common.loading') }}</div>
				<div v-else-if="errorMessage" class="rounded-2xl bg-[#fce8e6] px-4 py-3 text-sm text-[#c5221f] dark:bg-red-950/40 dark:text-red-300">{{ errorMessage }}</div>
				<div v-else-if="!(foldersByParent[currentPath] || []).length" class="py-6 text-center text-sm text-[#5f6368] dark:text-slate-400">{{ t('drive.noFiles') }}</div>
				<button v-for="folder in foldersByParent[currentPath] || []" :key="folder.id" type="button" class="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-[#202124] transition hover:bg-[#f1f6fd] dark:text-slate-100 dark:hover:bg-slate-700/60" @click="openFolder(folder)">
					<IconFolder :size="19" :stroke="2" class="shrink-0 text-[#5f6368] dark:text-slate-400" />
					<span class="truncate">{{ folder.file_name }}</span>
					<IconChevronRight :size="15" :stroke="2" class="ml-auto shrink-0 text-[#5f6368] dark:text-slate-500" />
				</button>
			</div>

			<div class="flex items-center justify-end gap-2 border-t border-[#e0e3e7] px-5 py-4 dark:border-slate-700">
				<button type="button" class="h-10 rounded-full px-5 text-sm font-medium text-[#5f6368] transition hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10" @click="emit('close')">
					{{ t('common.cancel') }}
				</button>
				<button type="button" class="h-10 rounded-full bg-[#1a73e8] px-5 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:cursor-not-allowed disabled:opacity-50" :disabled="isLoading" @click="confirmSelection">
					{{ confirmLabel }}
				</button>
			</div>
		</div>
	</div>
</template>
