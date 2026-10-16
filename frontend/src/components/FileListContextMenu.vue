<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconFolder, IconStar, IconStarFilled, IconEye, IconDownload, IconEdit, IconInfoCircle, IconTrash, IconArrowsMove, IconCopy, IconLink } from '@tabler/icons-vue';

const { t } = useI18n();

const props = defineProps({
	contextMenuRef: { type: Object, default: null },
	contextMenu: { type: Object, required: true },
	selectedCount: { type: Number, required: true },
	primarySelectedFile: { type: Object, default: null },
	canPreview: { type: Boolean, default: false },
	canToggleStar: { type: Boolean, default: false },
	isPrimaryStarred: { type: Boolean, default: false },
	canDownload: { type: Boolean, default: false },
	canRename: { type: Boolean, default: false },
	canMove: { type: Boolean, default: false },
	canCopy: { type: Boolean, default: false },
	canShowDetails: { type: Boolean, default: true },
	canOpenFolder: { type: Boolean, default: false },
	canDelete: { type: Boolean, default: true },
	canShare: { type: Boolean, default: true },
});

const emit = defineEmits(['open-folder', 'preview', 'toggle-star', 'download', 'rename', 'show-details', 'delete', 'move', 'copy', 'share', 'close']);

const showOpen = computed(() => props.canOpenFolder && props.selectedCount === 1 && Boolean(props.primarySelectedFile?.is_folder));
const showPreview = computed(() => props.selectedCount === 1 && !props.primarySelectedFile?.is_folder);
const showStar = computed(() => props.canToggleStar);

function handleOpen() {
	emit('open-folder');
}
function handlePreview() {
	emit('preview', props.primarySelectedFile);
}
function handleStar() {
	emit('toggle-star');
}
function handleDownload() {
	emit('download');
}
function handleRename() {
	emit('rename');
}
function handleDetails() {
	emit('show-details');
}
function handleDelete() {
	emit('delete');
}
function handleMove() {
	emit('move');
}
function handleCopy() {
	emit('copy');
}
function handleShare() {
	emit('share', props.primarySelectedFile);
}
</script>

<template>
	<div v-if="contextMenu.visible" ref="contextMenuRef" class="fixed z-50 min-w-[220px] overflow-hidden rounded-2xl border border-[#e0e3e7] bg-white py-2 shadow-[0_16px_40px_rgba(32,33,36,0.2)] dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_16px_40px_rgba(15,23,42,0.45)]" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop @contextmenu.stop>
		<button v-if="showOpen" type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#202124] hover:bg-[#f8fafd] dark:text-slate-100 dark:hover:bg-slate-700/70" @click="handleOpen">
			<IconFolder :size="17" :stroke="2" />
			<span>{{ t('common.open') }}</span>
		</button>
		<button v-if="showPreview" type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#202124] hover:bg-[#f8fafd] disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-700/70" :disabled="!canPreview" @click="handlePreview">
			<IconEye :size="17" :stroke="2" />
			<span>{{ t('drive.preview') }}</span>
		</button>
		<button v-if="showStar" type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#202124] hover:bg-[#f8fafd] dark:text-slate-100 dark:hover:bg-slate-700/70" @click="handleStar">
			<component :is="isPrimaryStarred ? IconStarFilled : IconStar" :size="17" :stroke="isPrimaryStarred ? 0 : 2" />
			<span>{{ isPrimaryStarred ? t('drive.unstar') : t('drive.star') }}</span>
		</button>
		<button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#202124] hover:bg-[#f8fafd] disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-700/70" :disabled="!canDownload" @click="handleDownload">
			<IconDownload :size="17" :stroke="2" />
			<span>{{ t('common.download') }}</span>
		</button>
		<button v-if="canRename" type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#202124] hover:bg-[#f8fafd] disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-700/70" :disabled="!canRename" :aria-label="t('common.rename')" @click="handleRename">
			<IconEdit :size="17" :stroke="2" />
			<span>{{ t('common.rename') }}</span>
		</button>
		<button v-if="canMove && selectedCount === 1" type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#202124] hover:bg-[#f8fafd] dark:text-slate-100 dark:hover:bg-slate-700/70" :aria-label="t('drive.move')" @click="handleMove">
			<IconArrowsMove :size="17" :stroke="2" />
			<span>{{ t('drive.move') }}</span>
		</button>
		<button v-if="canCopy && selectedCount === 1" type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#202124] hover:bg-[#f8fafd] dark:text-slate-100 dark:hover:bg-slate-700/70" :aria-label="t('drive.copy')" @click="handleCopy">
			<IconCopy :size="17" :stroke="2" />
			<span>{{ t('drive.copy') }}</span>
		</button>
		<button v-if="canShare && selectedCount === 1 && !primarySelectedFile?.is_folder" type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#202124] hover:bg-[#f8fafd] dark:text-slate-100 dark:hover:bg-slate-700/70" :aria-label="t('share.title')" @click="handleShare">
			<IconLink :size="17" :stroke="2" />
			<span>{{ t('share.title') }}</span>
		</button>
		<button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#202124] hover:bg-[#f8fafd] disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-700/70" :disabled="!canShowDetails" @click="handleDetails">
			<IconInfoCircle :size="17" :stroke="2" />
			<span>{{ t('drive.details') }}</span>
		</button>
		<button v-if="canDelete" type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[#c5221f] hover:bg-[#fce8e6] dark:text-red-300 dark:hover:bg-red-950/30" @click="handleDelete">
			<IconTrash :size="17" :stroke="2" />
			<span>{{ t('common.delete') }}</span>
		</button>
		<slot name="actions" />
	</div>
</template>
