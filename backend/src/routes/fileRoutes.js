import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { listFilesByPath, getFileById, getFileByRemoteId, listRecentFiles, listStarredFiles, searchFiles, setFileStarred, updateFileStarredByRemoteId, listTrashFiles, softDeleteFile, restoreFile, purgeFileRecord, updateFilePath, getFileRowById, createFileMetadata } from '../services/fileService.js';
import { getAccountById, getActiveAccounts } from '../services/accountService.js';
import { createAdapter } from '../services/adapterRegistry.js';
import { selectBestAccount } from '../services/spaceAllocator.js';
import { syncAccount } from '../services/syncService.js';
import { requireAppUser } from '../middleware/authMiddleware.js';

const router = Router();

router.use(requireAppUser);

function encodeSharedFileId(accountId, remoteFileId) {
	return `shared:${accountId}:${Buffer.from(String(remoteFileId)).toString('base64url')}`;
}

function mapSharedItem(userId, account, item, localFile = getFileByRemoteId(userId, account.id, item.remote_file_id)) {
	return {
		...(localFile || {}),
		...item,
		id: encodeSharedFileId(account.id, item.remote_file_id),
		cloud_account_id: account.id,
		provider: localFile?.provider || account.provider,
		email: item.owner_email || localFile?.email || account.email,
		createdTime: item.createdTime,
		modifiedTime: item.modifiedTime,
		capabilities: {
			starred: Boolean(item.capabilities?.starred ?? localFile?.capabilities?.starred ?? account.provider === 'google_drive'),
			rename: Boolean(item.capabilities?.rename ?? localFile?.capabilities?.rename ?? false),
			delete: Boolean(item.capabilities?.delete ?? localFile?.capabilities?.delete ?? false),
		},
	};
}

function decodeSharedFileId(fileId) {
	if (!fileId?.startsWith('shared:')) return null;
	const [, accountId, encodedRemoteFileId] = fileId.split(':');
	if (!accountId || !encodedRemoteFileId) return null;
	return {
		accountId,
		remoteFileId: Buffer.from(encodedRemoteFileId, 'base64url').toString('utf8'),
	};
}

async function getSharedFileContext(userId, fileId) {
	const parsed = decodeSharedFileId(fileId);
	if (!parsed) {
		return { file: null, account: null, adapter: null };
	}

	const account = getAccountById(userId, parsed.accountId);
	if (!account) {
		return { file: null, account: null, adapter: null };
	}

	const adapter = createAdapter(account);
	const sharedItems = await adapter.listSharedWithMe();
	let file = sharedItems.find((item) => item.remote_file_id === parsed.remoteFileId);
	if (!file) {
		try {
			const details = await adapter.getFileDetails({ remote_file_id: parsed.remoteFileId });
			if (details?.remote_file_id) {
				file = {
					file_name: details.file_name || details.name,
					is_folder: Boolean(details.is_folder),
					is_starred: 0,
					size: Number(details.size || 0),
					mime_type: details.mime_type || details.mimeType || null,
					remote_file_id: details.remote_file_id,
					remote_parent_id: details.remote_parent_id || null,
					remote_drive_id: details.remote_drive_id || null,
					createdTime: details.createdTime || null,
					modifiedTime: details.modifiedTime || null,
					owner_name: details.owner_name || null,
					owner_email: details.owner_email || account.email,
				};
			}
		} catch {
			file = null;
		}
	}
	if (!file) {
		return { file: null, account, adapter };
	}

	return {
		file: {
			...file,
			id: fileId,
			cloud_account_id: account.id,
			provider: account.provider,
			email: file.owner_email || account.email,
			capabilities: {
				starred: Boolean(file.capabilities?.starred ?? account.provider === 'google_drive'),
				rename: Boolean(file.capabilities?.rename ?? false),
				delete: Boolean(file.capabilities?.delete ?? false),
			},
		},
		account,
		adapter,
	};
}

async function getFileContext(userId, fileId) {
	const file = getFileById(userId, fileId);
	if (!file) {
		return getSharedFileContext(userId, fileId);
	}

	const account = getAccountById(userId, file.cloud_account_id);
	if (!account) {
		return { file, account: null, adapter: null };
	}

	return {
		file,
		account,
		adapter: createAdapter(account),
	};
}

function ensureFileContext(context, res, { allowDisconnected = false } = {}) {
	if (!context.file) {
		res.status(404).json({ error: 'File not found' });
		return false;
	}

	if (!context.account || !context.adapter || (context.account.status !== 'active' && !allowDisconnected)) {
		res.status(409).json({ error: 'The file account is no longer connected' });
		return false;
	}

	return true;
}


function normalizeTargetPath(input = '/') {
	const cleaned = String(input || '/').startsWith('/') ? String(input) : `/${String(input)}`;
	const trimmed = cleaned.replace(/\/+$/, '');
	return trimmed === '' ? '/' : `${trimmed}/`;
}

async function deleteContextFile(userId, context, rawId = context?.file?.id, options = {}) {
	const { sync = true, permanent = false } = options;
	// custom: remote sync is best-effort — DB record must transition even if the provider call fails
	try {
		if (permanent) {
			await context.adapter.purgeFile(context.file);
		} else {
			await context.adapter.deleteFile(context.file);
		}
	} catch (remoteError) {
		console.warn('deleteContextFile: remote delete failed (DB record still updated):', remoteError?.message || remoteError);
	}
	if (permanent) {
		purgeFileRecord(userId, context.file.id);
	} else {
		softDeleteFile(userId, context.file.id);
	}

	if (sync && context.account) {
		try {
			await syncAccount(userId, context.account);
		} catch (syncError) {
			console.warn('deleteContextFile: account sync failed:', syncError?.message || syncError);
		}
	}
}

async function listSharedWithMeFiles(userId) {
	const accounts = getActiveAccounts(userId);
	const settled = await Promise.allSettled(accounts.map(async (account) => {
		const adapter = createAdapter(account);
		const items = await adapter.listSharedWithMe();

		return items
			.map((item) => mapSharedItem(userId, account, item))
			.filter((item) => Boolean(item.remote_file_id));
	}));

	return settled
		.filter((result) => result.status === 'fulfilled')
		.flatMap((result) => result.value)
		.filter((item) => Boolean(item.remote_file_id))
		.filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
		.sort((left, right) => {
			const leftTime = new Date(left.modifiedTime || left.createdTime || 0).getTime();
			const rightTime = new Date(right.modifiedTime || right.createdTime || 0).getTime();
			if (leftTime !== rightTime) return rightTime - leftTime;
			return (left.file_name || '').localeCompare(right.file_name || '', 'id');
		});
}

router.get('/files', async (req, res, next) => {
	try {
		const files = req.query.search
			? searchFiles(req.user.id, req.query.search, req.query.limit)
			: req.query.starred === '1'
			? listStarredFiles(req.user.id)
			: req.query.recent === '1'
				? listRecentFiles(req.user.id)
				: req.query.shared === '1'
					? await listSharedWithMeFiles(req.user.id)
					: req.query.trash === '1'
						? listTrashFiles(req.user.id)
						: listFilesByPath(req.user.id, req.query.path || '/');
		res.json({ data: files });
	} catch (error) {
		next(error);
	}
});

router.get('/files/:id/shared-children', async (req, res, next) => {
	try {
		const context = await getFileContext(req.user.id, req.params.id);
		if (!ensureFileContext(context, res)) {
			return;
		}

		if (!context.file.is_folder) {
			return res.status(400).json({ error: 'Only folders can be opened' });
		}

		const items = await context.adapter.listSharedFolderChildren(context.file);
		return res.json({
			data: items.map((item) => mapSharedItem(req.user.id, context.account, item)).filter((item) => Boolean(item.remote_file_id)),
		});
	} catch (error) {
		next(error);
	}
});

router.patch('/files/:id/star', async (req, res, next) => {
	try {
		const context = await getFileContext(req.user.id, req.params.id);
		if (!ensureFileContext(context, res)) {
			return;
		}

		const isStarred = Boolean(req.body?.is_starred ?? req.body?.isStarred ?? true);
		const supportsStarred = Boolean(context.adapter.getCapabilities?.().starred);

		if (supportsStarred) {
			await context.adapter.setFileStarred(context.file, isStarred);
			await syncAccount(req.user.id, context.account);
			if (!decodeSharedFileId(context.file.id)) {
				updateFileStarredByRemoteId(req.user.id, context.account.id, context.file.remote_file_id, isStarred);
			}
		} else {
			setFileStarred(req.user.id, context.file.id, isStarred);
		}
		return res.json({ data: { success: true, is_starred: isStarred, provider_sync: supportsStarred } });
	} catch (error) {
		next(error);
	}
});

router.post('/files/bulk/delete', async (req, res, next) => {
	try {
		const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter(Boolean))] : [];
		if (!ids.length) {
			return res.status(400).json({ error: 'At least one file id is required' });
		}

		const contexts = await Promise.all(ids.map(async (id) => ({ id, ...await getFileContext(req.user.id, id) })));
		// custom: allow trashing files from a disconnected account — DB record still updates (best-effort remote)
		const invalid = contexts.find((context) => !context.file || !context.account || !context.adapter);
		if (invalid) {
			return res.status(invalid.file ? 409 : 404).json({ error: invalid.file ? 'One or more file accounts are no longer connected' : 'One or more files were not found' });
		}

		const touchedAccountIds = new Set();
		for (const context of contexts) {
			await deleteContextFile(req.user.id, context, context.id, { sync: false });
			touchedAccountIds.add(context.account.id);
		}

		// custom: sync di background agar respons tidak menunggu remote Drive
		for (const accountId of touchedAccountIds) {
			const account = getAccountById(req.user.id, accountId);
			if (account) {
				syncAccount(req.user.id, account).catch((syncError) => {
					console.warn('bulk delete: account sync failed:', syncError?.message || syncError);
				});
			}
		}

		return res.json({ data: { success: true, count: contexts.length } });
	} catch (error) {
		next(error);
	}
});

router.get('/files/:id', async (req, res, next) => {
	try {
		const context = await getFileContext(req.user.id, req.params.id);
		if (!ensureFileContext(context, res)) {
			return;
		}

		const details = await context.adapter.getFileDetails(context.file);
		return res.json({
			data: {
				...context.file,
				...details,
			},
		});
	} catch (error) {
		next(error);
	}
});

router.get('/files/:id/download', async (req, res, next) => {
	try {
		const context = await getFileContext(req.user.id, req.params.id);
		if (!ensureFileContext(context, res)) {
			return;
		}
		const stream = await context.adapter.getDownloadStream(context.file);

		res.setHeader('Content-Disposition', `attachment; filename="${context.file.file_name}"`);
		res.setHeader('Content-Type', context.file.mime_type || 'application/octet-stream');
		if (!context.file.is_folder && context.file.size) {
			res.setHeader('Content-Length', String(context.file.size));
		}
		stream.pipe(res);
	} catch (error) {
		next(error);
	}
});

router.get('/files/:id/preview', async (req, res, next) => {
	try {
		const context = await getFileContext(req.user.id, req.params.id);
		if (!ensureFileContext(context, res)) {
			return;
		}

		if (context.file.is_folder) {
			return res.status(400).json({ error: 'Folder preview is not supported' });
		}

		const mimeType = context.file.mime_type || 'application/octet-stream';
		const isPreviewable = /^(image|video|audio|text)\//.test(mimeType)
			|| mimeType === 'application/pdf'
			|| mimeType === 'application/json';

		if (!isPreviewable) {
			return res.status(415).json({ error: 'Preview is not supported for this file type' });
		}

		const stream = await context.adapter.getDownloadStream(context.file);

		res.setHeader('Content-Disposition', `inline; filename="${context.file.file_name}"`);
		res.setHeader('Content-Type', mimeType);
		if (context.file.size) {
			res.setHeader('Content-Length', String(context.file.size));
		}

		stream.pipe(res);
	} catch (error) {
		next(error);
	}
});

router.patch('/files/:id/rename', async (req, res, next) => {
	try {
		const { name } = req.body;
		if (!name?.trim()) {
			return res.status(400).json({ error: 'New name is required' });
		}

		const context = await getFileContext(req.user.id, req.params.id);
		if (!ensureFileContext(context, res)) {
			return;
		}

		await context.adapter.renameFile(context.file, name.trim());
		await syncAccount(req.user.id, context.account);

		return res.json({ data: { success: true } });
	} catch (error) {
		next(error);
	}
});

router.delete('/files/:id', async (req, res, next) => {
	try {
		const context = await getFileContext(req.user.id, req.params.id);
		if (!ensureFileContext(context, res, { allowDisconnected: true })) {
			return;
		}

		const permanent = req.query.permanent === '1';
		// Soft delete: trash on the provider (when supported, best-effort) + mark locally.
		await deleteContextFile(req.user.id, context, context.file.id, { sync: true, permanent });

		return res.json({ data: { success: true, permanent } });
	} catch (error) {
		next(error);
	}
});

router.post('/files/:id/restore', async (req, res, next) => {
	if (req.params.id === 'bulk') return next(); // custom: biarkan /files/bulk/restore menangani
	try {
		const context = await getFileContext(req.user.id, req.params.id);
		if (!ensureFileContext(context, res, { allowDisconnected: true })) {
			return;
		}

		const supportsTrash = Boolean(context.adapter?.getCapabilities?.().trash);
		if (supportsTrash) {
			try {
				await context.adapter.restoreFile(context.file);
			} catch (remoteError) {
				console.warn('restore: remote restore failed (DB record still restored):', remoteError?.message || remoteError);
			}
		}
		restoreFile(req.user.id, context.file.id);
		if (context.account) {
			try {
				await syncAccount(req.user.id, context.account);
			} catch (syncError) {
				console.warn('restore: account sync failed:', syncError?.message || syncError);
			}
		}

		return res.json({ data: { success: true } });
	} catch (error) {
		next(error);
	}
});

router.post('/files/bulk/restore', async (req, res, next) => {
	try {
		const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter(Boolean))] : [];
		if (!ids.length) {
			return res.status(400).json({ error: 'At least one file id is required' });
		}

		let restored = 0;
		const touchedAccountIds = new Set();
		for (const id of ids) {
			// custom: gunakan row mentah — file dalam trash ter-filter dari getFileById
			const file = getFileRowById(req.user.id, id) || getFileById(req.user.id, id);
			const account = file ? getAccountById(req.user.id, file.cloud_account_id) : null;
			const adapter = account ? createAdapter(account) : null;
			if (!file || !account || !adapter) continue;
			const supportsTrash = Boolean(adapter.getCapabilities?.().trash);
			try {
				if (supportsTrash) {
					try {
						await adapter.restoreFile(file);
					} catch (remoteError) {
						console.warn('bulk restore: remote restore failed (DB record still restored):', remoteError?.message || remoteError);
					}
				}
				restoreFile(req.user.id, file.id);
				restored += 1;
				touchedAccountIds.add(account.id);
			} catch (error) {
				// Keep restoring the rest.
			}
		}

		// custom: sync background agar respons cepat
		for (const accountId of touchedAccountIds) {
			const account = getAccountById(req.user.id, accountId);
			if (account) {
				syncAccount(req.user.id, account).catch((syncError) => {
					console.warn('bulk restore: account sync failed:', syncError?.message || syncError);
				});
			}
		}

		return res.json({ data: { success: true, count: restored } });
	} catch (error) {
		next(error);
	}
});

// custom: bulk purge — permanently remove trashed records (optionally only the given ids)
router.post('/files/bulk/purge', async (req, res, next) => {
	try {
		const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter(Boolean))] : [];
		const purgeAll = req.body?.all === true;
		if (!purgeAll && !ids.length) {
			return res.status(400).json({ error: 'At least one file id is required' });
		}

		const targets = purgeAll
			? listTrashFiles(req.user.id).map((row) => row.id)
			: ids;
		if (!targets.length) {
			return res.json({ data: { success: true, count: 0 } });
		}

		let purged = 0;
		const touchedAccountIds = new Set();
		for (const id of targets) {
			// custom: row mentah — file trash ter-filter dari getFileById
			const file = getFileRowById(req.user.id, id) || getFileById(req.user.id, id);
			if (!file) continue;
			const account = getAccountById(req.user.id, file.cloud_account_id);
			const adapter = account ? createAdapter(account) : null;
			try {
				if (account && adapter) {
					try {
						await adapter.purgeFile(file);
					} catch (remoteError) {
						console.warn('bulk purge: remote purge failed (DB record still purged):', remoteError?.message || remoteError);
					}
					touchedAccountIds.add(account.id);
				}
				purgeFileRecord(req.user.id, file.id);
				purged += 1;
			} catch (error) {
				// Keep purging the rest.
			}
		}

		// custom: sync background agar respons cepat
		for (const accountId of touchedAccountIds) {
			const account = getAccountById(req.user.id, accountId);
			if (account) {
				syncAccount(req.user.id, account).catch((syncError) => {
					console.warn('bulk purge: account sync failed:', syncError?.message || syncError);
				});
			}
		}

		return res.json({ data: { success: true, count: purged } });
	} catch (error) {
		next(error);
	}
});

// custom: bulk move — move many files into one destination folder
router.post('/files/bulk/move', async (req, res, next) => {
	try {
		const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter(Boolean))] : [];
		const { targetPath, targetFolderId } = req.body || {};
		if (!ids.length) {
			return res.status(400).json({ error: 'At least one file id is required' });
		}
		if (!targetPath && !targetFolderId) {
			return res.status(400).json({ error: 'targetPath or targetFolderId is required' });
		}

		// Resolve destination once for the whole batch.
		let targetFolder = null;
		if (targetFolderId) {
			targetFolder = getFileRowById(req.user.id, targetFolderId);
			if (!targetFolder || !targetFolder.is_folder) {
				return res.status(400).json({ error: 'Target folder not found' });
			}
		} else {
			const normalizedTarget = String(targetPath || '/').startsWith('/') ? String(targetPath) : `/${targetPath}`;
			targetFolder = listFilesByPath(req.user.id, normalizedTarget).find((item) => item.is_folder);
		}
		const nextPath = targetFolder?.virtual_path
			|| normalizeTargetPath(String(targetPath || '/'));

		let moved = 0;
		const touchedAccountIds = new Set();
		for (const id of ids) {
			const context = await getFileContext(req.user.id, id);
			if (!context.file || !context.account || !context.adapter || context.file.is_folder) continue;
			const supportsMove = Boolean(context.adapter.getCapabilities?.().move);
			if (!supportsMove) continue;
			try {
				const remoteParentId = targetFolder?.remote_file_id || context.adapter.account?.rootId || undefined;
				if (remoteParentId) {
					try {
						await context.adapter.moveFile(context.file, remoteParentId);
					} catch (remoteError) {
						console.warn('bulk move: remote move failed (DB record still moved):', remoteError?.message || remoteError);
					}
				}
				updateFilePath(req.user.id, context.file.id, nextPath);
				moved += 1;
				touchedAccountIds.add(context.account.id);
			} catch (error) {
				// Keep moving the rest.
			}
		}

		for (const accountId of touchedAccountIds) {
			const account = getAccountById(req.user.id, accountId);
			if (account) {
				try {
					await syncAccount(req.user.id, account);
				} catch (syncError) {
					console.warn('bulk move: account sync failed:', syncError?.message || syncError);
				}
			}
		}

		return res.json({ data: { success: true, count: moved } });
	} catch (error) {
		next(error);
	}
});

router.patch('/files/:id/move', async (req, res, next) => {
	try {
		const { targetPath, targetFolderId } = req.body || {};
		if (!targetPath && !targetFolderId) {
			return res.status(400).json({ error: 'targetPath or targetFolderId is required' });
		}

		const context = await getFileContext(req.user.id, req.params.id);
		if (!ensureFileContext(context, res)) {
			return;
		}
		if (context.file.is_folder) {
			return res.status(400).json({ error: 'Moving folders is not supported yet' });
		}

		const supportsMove = Boolean(context.adapter.getCapabilities?.().move);
		if (!supportsMove) {
			return res.status(400).json({ error: 'Move is not supported for this provider' });
		}

		// Resolve destination remote parent id.
		let targetFolder = null;
		if (targetFolderId) {
			targetFolder = getFileRowById(req.user.id, targetFolderId);
			if (!targetFolder || !targetFolder.is_folder) {
				return res.status(400).json({ error: 'Target folder not found' });
			}
		} else {
			const normalizedTarget = String(targetPath || '/').startsWith('/') ? String(targetPath) : `/${targetPath}`;
			targetFolder = listFilesByPath(req.user.id, normalizedTarget).find((item) => item.is_folder);
		}

		// custom: virtual_path stores the PARENT folder path (trailing slash), matching listFilesByPath convention
		const nextPath = targetFolder?.virtual_path
			|| normalizeTargetPath(String(targetPath || '/'));

		const remoteParentId = targetFolder?.remote_file_id || context.adapter.account?.rootId || undefined;
		if (remoteParentId) {
			try {
				await context.adapter.moveFile(context.file, remoteParentId);
			} catch (remoteError) {
				console.warn('move: remote move failed (DB record still moved):', remoteError?.message || remoteError);
			}
		}
		updateFilePath(req.user.id, context.file.id, nextPath);
		try {
			await syncAccount(req.user.id, context.account);
		} catch (syncError) {
			console.warn('move: account sync failed:', syncError?.message || syncError);
		}

		return res.json({ data: { success: true } });
	} catch (error) {
		next(error);
	}
});

router.post('/files/:id/copy', async (req, res, next) => {
	try {
		const { name, targetPath, targetFolderId } = req.body || {};
		const context = await getFileContext(req.user.id, req.params.id);
		if (!ensureFileContext(context, res)) {
			return;
		}
		if (context.file.is_folder) {
			return res.status(400).json({ error: 'Copying folders is not supported yet' });
		}

		const supportsCopy = Boolean(context.adapter.getCapabilities?.().copy);
		if (!supportsCopy) {
			return res.status(400).json({ error: 'Copy is not supported for this provider' });
		}

		// Destination: same folder by default, or a target folder.
		let destFolder = null;
		if (targetFolderId) {
			destFolder = getFileRowById(req.user.id, targetFolderId);
			if (!destFolder || !destFolder.is_folder) {
				return res.status(400).json({ error: 'Target folder not found' });
			}
		} else if (targetPath) {
			const normalizedTarget = String(targetPath).startsWith('/') ? String(targetPath) : `/${targetPath}`;
			destFolder = listFilesByPath(req.user.id, normalizedTarget).find((item) => item.is_folder);
		} else {
			destFolder = listFilesByPath(req.user.id, context.file.virtual_path).find((item) => item.is_folder);
		}

		let copied;
		try {
			copied = await context.adapter.copyFile(context.file, {
				name: name?.trim() || undefined,
				remoteParentId: destFolder?.remote_file_id || undefined,
			});
		} catch (remoteError) {
			// custom: fallback to a local-only copy record when the provider copy fails
			console.warn('copy: remote copy failed, creating local record only:', remoteError?.message || remoteError);
			copied = {
				file_name: name?.trim() ? `${name.trim()}` : `${context.file.file_name.replace(/(\.[^.]*)?$/, (m) => ` (copy)${m || ''}`)}`,
				size: context.file.size,
				mime_type: context.file.mime_type,
				remote_file_id: `local-copy-${randomUUID()}`,
				remote_parent_id: destFolder?.remote_file_id || null,
				remote_created_time: null,
				remote_modified_time: null,
			};
		}

		// custom: virtual_path = parent folder path (trailing slash), matching listFilesByPath convention
		const nextPath = destFolder?.virtual_path || context.file.virtual_path;

		createFileMetadata({
			user_id: req.user.id,
			virtual_path: nextPath,
			file_name: copied.file_name,
			is_folder: 0,
			size: copied.size,
			mime_type: copied.mime_type,
			cloud_account_id: context.account.id,
			remote_file_id: copied.remote_file_id,
			remote_parent_id: copied.remote_parent_id,
			remote_created_time: copied.remote_created_time,
			remote_modified_time: copied.remote_modified_time,
		});

		return res.json({ data: { success: true, file: getFileRowById(req.user.id, context.file.id) ? { id: undefined, file_name: copied.file_name } : null } });
	} catch (error) {
		next(error);
	}
});

router.post('/files/folders', async (req, res, next) => {
	try {
		const { name, virtual_path = '/' } = req.body;

		if (!name?.trim()) {
			return res.status(400).json({ error: 'Folder name is required' });
		}

		const { selected } = selectBestAccount(req.user.id, 0);
		const account = getAccountById(req.user.id, selected.id);
		const adapter = createAdapter(account);

		await adapter.createFolder({
			name: name.trim(),
			virtualPath: virtual_path,
		});

		await syncAccount(req.user.id, account);

		return res.status(201).json({ data: { success: true } });
	} catch (error) {
		next(error);
	}
});

export default router;
