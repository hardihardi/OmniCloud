<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { IconDownload, IconAlertTriangle, IconLoader } from '@tabler/icons-vue';

// custom4: halaman publik share /s/:token — preview + download, tanpa login
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api';
const { t } = useI18n();
const route = useRoute();

const token = route.params.token;
const meta = ref(null);
const error = ref('');
const isLoading = ref(true);
const isPreviewLoading = ref(true);

const shareBase = `${API_BASE}/share/${encodeURIComponent(token)}`;
const previewUrl = `${shareBase}/preview`;
const downloadUrl = `${shareBase}/download`;

const isImage = ref(false);
const isVideo = ref(false);
const isAudio = ref(false);
const isPdf = ref(false);
const isText = ref(false);

function classify(mt) {
	isImage.value = /^image\//.test(mt);
	isVideo.value = /^video\//.test(mt);
	isAudio.value = /^audio\//.test(mt);
	isPdf.value = mt === 'application/pdf';
	isText.value = /^text\//.test(mt) || mt === 'application/json';
}

function formatBytes(bytes) {
	if (!bytes && bytes !== 0) return '';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = Number(bytes);
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
	return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

onMounted(async () => {
	try {
		const res = await fetch(`${shareBase}`, { signal: AbortSignal.timeout(15000) });
		const payload = await res.json().catch(() => ({}));
		if (!res.ok) {
			error.value = payload.error || t('sharePage.notFound');
		} else {
			meta.value = payload;
			classify(payload.mimeType || '');
		}
	} catch {
		error.value = t('sharePage.notFound');
	} finally {
		isLoading.value = false;
	}
});

function onPreviewLoad() { isPreviewLoading.value = false; }
function onPreviewError() { isPreviewLoading.value = false; }
</script>

<template>
	<div class="flex min-h-screen flex-col bg-[#f8fafd] text-[#202124] dark:bg-slate-950 dark:text-slate-100">
		<header class="flex items-center justify-between gap-4 border-b border-[#e8eaed] bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
			<div class="flex items-center gap-2 font-semibold">
				<span class="grid size-8 place-items-center rounded-lg bg-[#1a73e8] text-sm font-bold text-white">O</span>
				<span class="text-base">OmniCloud</span>
			</div>
			<a :href="downloadUrl" class="flex h-10 items-center gap-2 rounded-full bg-[#1a73e8] px-4 text-sm font-medium text-white transition hover:bg-[#1765cc]">
				<IconDownload :size="16" :stroke="2" />
				<span class="hidden sm:inline">{{ t('sharePage.download') }}</span>
			</a>
		</header>

		<main class="flex flex-1 flex-col items-center justify-center px-4 py-6">
			<div v-if="isLoading" class="flex items-center gap-2 text-sm text-[#5f6368] dark:text-slate-400">
				<IconLoader :size="18" class="animate-spin" />
				{{ t('common.loading') }}
			</div>

			<div v-else-if="error" class="w-full max-w-md rounded-[28px] bg-white p-8 text-center shadow-[0_16px_40px_rgba(32,33,36,0.14)] dark:bg-slate-900">
				<span class="mx-auto grid size-14 place-items-center rounded-full bg-[#fce8e6] text-[#d93025] dark:bg-red-900/40 dark:text-red-300">
					<IconAlertTriangle :size="26" :stroke="2" />
				</span>
				<h1 class="mt-4 text-lg font-semibold">{{ t('sharePage.notFoundTitle') }}</h1>
				<p class="mt-2 text-sm text-[#5f6368] dark:text-slate-400">{{ error }}</p>
			</div>

			<div v-else class="w-full max-w-5xl">
				<div class="mb-4 text-center sm:text-left">
					<h1 class="truncate text-lg font-semibold sm:text-xl" :title="meta.fileName">{{ meta.fileName }}</h1>
					<p class="mt-1 text-xs text-[#5f6368] dark:text-slate-400">
						{{ [formatBytes(meta.size), meta.ownerEmail].filter(Boolean).join(' · ') }}
					</p>
				</div>

				<div class="relative overflow-hidden rounded-[24px] bg-white shadow-[0_16px_40px_rgba(32,33,36,0.14)] dark:bg-slate-900">
					<div v-if="isPreviewLoading" class="absolute inset-0 z-10 grid place-items-center text-sm text-[#5f6368] dark:text-slate-400">
						<IconLoader :size="20" class="animate-spin" />
					</div>
					<img v-if="isImage" :src="previewUrl" class="max-h-[75vh] w-full object-contain" :alt="meta.fileName" @load="onPreviewLoad" @error="onPreviewError" />
					<video v-else-if="isVideo" class="max-h-[75vh] w-full bg-black" controls playsinline preload="metadata" @loadeddata="onPreviewLoad" @error="onPreviewError">
						<source :src="previewUrl" :type="meta.mimeType" />
					</video>
					<audio v-else-if="isAudio" class="w-full p-6" :src="previewUrl" controls preload="metadata" @loadeddata="onPreviewLoad" @error="onPreviewError" />
					<iframe v-else-if="isPdf || isText" :src="previewUrl" class="h-[75vh] w-full border-0" :title="meta.fileName" @load="onPreviewLoad" />
					<div v-else class="grid min-h-[280px] place-items-center p-8 text-center">
						<div>
							<p class="text-sm text-[#5f6368] dark:text-slate-400">{{ t('sharePage.noPreview') }}</p>
							<a :href="downloadUrl" class="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-[#1a73e8] px-5 text-sm font-medium text-white hover:bg-[#1765cc]">
								<IconDownload :size="16" :stroke="2" />
								{{ t('sharePage.download') }}
							</a>
						</div>
					</div>
				</div>
			</div>
		</main>
	</div>
</template>
