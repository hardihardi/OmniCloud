<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { IconFolder, IconRestore, IconTrash, IconAlertTriangle } from '@tabler/icons-vue';
import DriveShell from '../components/DriveShell.vue';
import FileListFilterBar from '../components/FileListFilterBar.vue';
import FileListSelectionBar from '../components/FileListSelectionBar.vue';
import FileListViewModeToggle from '../components/FileListViewModeToggle.vue';
import FileListHeader from '../components/FileListHeader.vue';
import FileListRow from '../components/FileListRow.vue';
import FileListGridCard from '../components/FileListGridCard.vue';
import FileListContextMenu from '../components/FileListContextMenu.vue';
import FileDetailsModal from '../components/FileDetailsModal.vue';
import LoadingState from '../components/LoadingState.vue';
import { useIncrementalRender } from '../composables/useIncrementalRender';
import { useFileListView } from '../composables/useFileListView';
import { providerLabel } from '../composables/useFormatFile.js';
import { useFileTreeStore } from '../stores/fileTree';
import { useUploadQueueStore } from '../stores/uploadQueue';
import { api } from '../services/api';

const { t } = useI18n();
const router = useRouter();
const fileTreeStore = useFileTreeStore();
const uploadQueueStore = useUploadQueueStore();

const view = useFileListView({
	loadFiles: async () => {
		const { data } = await api.listTrashFiles();
		return Array.isArray(data) ? data : [];
	},
	uploadQueueStore,
	sortable: true,
	initialSortBy: 'updated_at',
	initialSortDirection: 'desc',
});

const {
	loading,
	errorMessage,
	searchTerm,
	isGridView,
	activeFilterMenu,
	selectedTypeFilter,
	selectedOwnerFilter,
	selectedUpdatedFilter,
	typeOptions,
	updatedOptions,
	ownerOptions,
	sortBy,
	sortDirection,
	setSort,
	toggleFilterMenu,
	applyFilter,
	clearFilter,
	sortedFiles,
	selectedCount,
	primarySelectedFile,
	isSelected,
	openContextMenu,
	clearSelection,
	selectItem,
	canOpenSelection,
	previewFile,
	isPreviewOpen,
	isPreviewLoading,
	openPreview,
	closePreview,
	handlePreviewLoaded,
	handlePreviewFailed,
	detailsFile,
	isDetailsOpen,
	closeDetails,
	showSelectedFileDetails,
	contextMenu,
	contextMenuRef,
	closeContextMenu,
	refresh,
	actionInProgress,
	actionLabel,
} = view;

const { visibleItems: renderedFiles, handleScroll: handleListScroll } = useIncrementalRender(sortedFiles, {
	initialCount: 80,
	step: 80,
	threshold: 240,
});

const isRestoreBusy = computed(() => actionInProgress.value);

function openFolder(file) {
	if (!file?.is_folder) return;
	clearSelection();
	const parent = file.virtual_path || '/';
	const inside = `${parent === '/' ? '' : parent}${file.file_name}/`;
	const targetPath = inside.startsWith('/') ? inside : `/${inside}`;
	fileTreeStore.pendingPath = targetPath;
	router.push({ path: '/my-drive' });
}

function openSelectedItem() {
	const file = primarySelectedFile.value || contextMenu.value.file;
	closeContextMenu();
	if (file?.is_folder) openFolder(file);
}

async function restoreItem(file = primarySelectedFile.value) {
	if (!file) return;
	view.actionInProgress.value = true;
	view.actionLabel.value = t('trash.restoring');
	try {
		await api.restoreFile(file.id);
		await refresh();
		clearSelection();
	} catch (error) {
		view.errorMessage.value = error.message || t('trash.restoreFailed');
	} finally {
		view.actionInProgress.value = false;
		view.actionLabel.value = '';
	}
}

async function restoreSelected() {
	const selection = view.selectedFileIds?.value;
	const ids = selection && selection.size ? [...selection] : sortedFiles.value.filter((item) => isSelected(item)).map((item) => item.id);
	if (!ids.length) return;
	view.actionInProgress.value = true;
	view.actionLabel.value = t('trash.restoring');
	try {
		await api.restoreFiles(ids);
		await refresh();
		clearSelection();
	} catch (error) {
		view.errorMessage.value = error.message || t('trash.restoreFailed');
	} finally {
		view.actionInProgress.value = false;
		view.actionLabel.value = '';
	}
}

async function purgeItem(file = primarySelectedFile.value) {
	if (!file) return;
	if (!window.confirm(t('trash.deleteForeverConfirm'))) return;
	view.actionInProgress.value = true;
	view.actionLabel.value = t('trash.deleting');
	try {
		await api.purgeFile(file.id);
		await refresh();
		clearSelection();
	} catch (error) {
		view.errorMessage.value = error.message || t('trash.deleteFailed');
	} finally {
		view.actionInProgress.value = false;
		view.actionLabel.value = '';
	}
}

async function emptyTrash() {
	if (!sortedFiles.value.length) return;
	if (!window.confirm(t('trash.emptyConfirm'))) return;
	view.actionInProgress.value = true;
	view.actionLabel.value = t('trash.emptying');
	try {
		await Promise.allSettled(sortedFiles.value.map((item) => api.purgeFile(item.id)));
		await refresh();
		clearSelection();
	} catch (error) {
		view.errorMessage.value = error.message || t('trash.deleteFailed');
	} finally {
		view.actionInProgress.value = false;
		view.actionLabel.value = '';
	}
}
</script>

<template>
	<DriveShell current-section="trash">
		<div class="relative min-h-[calc(100vh-84px)] rounded-[24px] bg-white px-4 py-[18px] pb-5 text-[#202124] dark:bg-slate-800 dark:text-slate-100 sm:px-6" @click="clearSelection">
			<div class="mb-2 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
				<h1 class="m-0 text-2xl font-normal text-[#202124] dark:text-slate-100">{{ t('nav.trash') }}</h1>
				<div class="flex items-center gap-2">
					<button type="button" class="inline-flex h-10 items-center gap-2 rounded-full border border-[#dadce0] px-4 text-sm font-medium text-[#c5221f] transition hover:bg-[#fce8e6] disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40" :disabled="isRestoreBusy || !sortedFiles.length" :aria-label="t('trash.empty')" @click.stop="emptyTrash">
						<IconAlertTriangle :size="17" :stroke="2" />
						<span class="hidden sm:inline">{{ t('trash.empty') }}</span>
					</button>
					<FileListViewModeToggle v-model="isGridView" />
				</div>
			</div>

			<p class="mb-3 text-sm text-[#5f6368] dark:text-slate-400">{{ t('trash.hint') }}</p>

			<div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<FileListSelectionBar v-if="selectedCount" :selected-count="selectedCount" :can-preview="false" :can-toggle-star="false" :is-primary-starred="false" :can-download="false" :can-rename="false" :primary-file="primarySelectedFile" @clear="clearSelection" @show-details="showSelectedFileDetails">
					<template #prefix>
						<button type="button" class="inline-flex size-9 items-center justify-center rounded-full transition enabled:hover:bg-[#d2e3fc] dark:enabled:hover:bg-sky-500/20" :title="t('trash.restore')" :aria-label="t('trash.restore')" @click.stop="restoreSelected">
							<IconRestore :size="18" :stroke="2" />
						</button>
					</template>
					<template #suffix>
						<button type="button" class="inline-flex size-9 items-center justify-center rounded-full text-[#c5221f] transition enabled:hover:bg-[#fce8e6] dark:text-red-300 dark:enabled:hover:bg-red-950/40" :title="t('trash.deleteForever')" :aria-label="t('trash.deleteForever')" @click.stop="purgeItem()">
							<IconTrash :size="18" :stroke="2" />
						</button>
					</template>
				</FileListSelectionBar>
				<FileListFilterBar v-else :type-options="typeOptions" :owner-options="ownerOptions" :updated-options="updatedOptions" :selected-type-filter="selectedTypeFilter" :selected-owner-filter="selectedOwnerFilter" :selected-updated-filter="selectedUpdatedFilter" :active-filter-menu="activeFilterMenu" v-model:search-term="searchTerm" @toggle-filter-menu="toggleFilterMenu" @apply-filter="applyFilter" @clear-filter="clearFilter" />
			</div>

			<p v-if="errorMessage" class="mb-4 rounded-2xl bg-[#fce8e6] px-4 py-3 text-sm text-[#c5221f] dark:bg-red-950/40 dark:text-red-300">{{ errorMessage }}</p>

			<div v-if="!isGridView" class="relative">
				<div class="custom-scrollbar overflow-x-auto rounded-2xl border border-[#e0e3e7] bg-white dark:border-slate-700 dark:bg-slate-800">
					<div class="min-w-[760px]">
						<div class="custom-scrollbar max-h-[min(52vh,520px)] overflow-y-auto overflow-x-hidden" @scroll="handleListScroll">
							<FileListHeader :sortable="true" :sort-by="sortBy" :sort-direction="sortDirection" @sort="setSort" />

							<FileListRow v-for="item in renderedFiles" :key="item.id" :item="item" :selected="isSelected(item)" @select="(event) => selectItem(event, item)" @open="() => {}" @contextmenu="(event) => openContextMenu(event, item)" />
							<div v-if="!sortedFiles.length && !loading" class="p-[18px] text-[#5f6368] dark:text-slate-400">{{ t('trash.emptyState') }}</div>
							<div v-if="loading" class="p-[18px]"><LoadingState /></div>
						</div>
					</div>
				</div>
				<LoadingState v-if="actionInProgress" variant="overlay" :message="actionLabel || t('drive.processing')" />
			</div>

			<div v-else class="relative">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<FileListGridCard v-for="item in renderedFiles" :key="item.id" :item="item" :selected="isSelected(item)" @select="(event) => selectItem(event, item)" @open="() => {}" @contextmenu="(event) => openContextMenu(event, item)" />
					<div v-if="!sortedFiles.length && !loading" class="col-span-full rounded-2xl border border-dashed border-[#dadce0] bg-white px-5 py-8 text-center text-[#5f6368] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">{{ t('trash.emptyState') }}</div>
					<div v-if="loading" class="col-span-full rounded-2xl border border-dashed border-[#dadce0] bg-white px-5 py-8 text-center text-[#5f6368] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"><LoadingState /></div>
				</div>
				<LoadingState v-if="actionInProgress" variant="overlay" :message="actionLabel || t('drive.processing')" />
			</div>

			<FileListContextMenu :context-menu-ref="contextMenuRef" :context-menu="contextMenu" :selected-count="selectedCount" :primary-selected-file="primarySelectedFile" :can-preview="false" :can-toggle-star="false" :is-primary-starred="false" :can-download="false" :can-rename="false" :can-show-details="selectedCount === 1" :can-open-folder="false" :can-delete="false" @show-details="showSelectedFileDetails" @close="closeContextMenu">
				<template #actions>
					<button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#202124] hover:bg-[#f8fafd] dark:text-slate-100 dark:hover:bg-slate-700/70" @click="restoreItem(contextMenu.file); closeContextMenu()">
						<IconRestore :size="17" :stroke="2" />
						<span>{{ t('trash.restore') }}</span>
					</button>
					<button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#c5221f] hover:bg-[#fce8e6] dark:text-red-300 dark:hover:bg-red-950/30" @click="purgeItem(contextMenu.file); closeContextMenu()">
						<IconTrash :size="17" :stroke="2" />
						<span>{{ t('trash.deleteForever') }}</span>
					</button>
				</template>
			</FileListContextMenu>

			<FileDetailsModal :file="detailsFile" :is-open="isDetailsOpen" :is-folder="detailsFile?.is_folder" :provider-label-fn="providerLabel" @close="closeDetails" />
		</div>
	</DriveShell>
</template>
