import { randomUUID } from 'crypto';
import { db } from '../config/database.js';
import { resolveMimeType } from '../utils/mime.js';

function normalizePath(input = '/') {
	if (!input || input === '/') return '/';
	const cleaned = input.startsWith('/') ? input : `/${input}`;
	return cleaned.endsWith('/') ? cleaned : `${cleaned}/`;
}

function buildDisplayNames(rows) {
	return rows.map((row) => ({
		...row,
		createdTime: row.remote_created_time || null,
		modifiedTime: row.remote_modified_time || null,
		capabilities: {
			starred: row.provider === 'google_drive',
			rename: true,
			delete: true,
		},
	}));
}

export function listFilesByPath(userId, virtualPath = '/') {
	const normalized = normalizePath(virtualPath);
	const rows = db
		.prepare(`
      SELECT
        fm.*, ca.provider, ca.email
      FROM file_metadata fm
      INNER JOIN cloud_accounts ca ON ca.id = fm.cloud_account_id
			WHERE fm.user_id = ?
				AND fm.deleted_at IS NULL
				AND fm.virtual_path = ?
				AND ca.status = 'active'
      ORDER BY fm.is_folder DESC, fm.file_name COLLATE NOCASE ASC
    `)
		.all(userId, normalized);

	return buildDisplayNames(rows);
}

export function searchFiles(userId, term = '', limit = 50) {
	const normalizedTerm = String(term || '').trim();
	if (!normalizedTerm) return [];

	const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
	const rows = db
		.prepare(`
      SELECT
        fm.*, ca.provider, ca.email
      FROM file_metadata fm
      INNER JOIN cloud_accounts ca ON ca.id = fm.cloud_account_id
			WHERE fm.user_id = ?
				AND ca.status = 'active'
				AND fm.deleted_at IS NULL
				AND fm.file_name LIKE ? COLLATE NOCASE
      ORDER BY
				CASE WHEN fm.file_name LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END,
				fm.is_folder DESC,
				COALESCE(fm.remote_created_time, fm.created_at) DESC,
				fm.file_name COLLATE NOCASE ASC
			LIMIT ?
    `)
		.all(userId, `%${normalizedTerm}%`, `${normalizedTerm}%`, safeLimit);

	return buildDisplayNames(rows);
}

export function createFileMetadata(record) {
	const payload = {
		id: randomUUID(),
		user_id: record.user_id,
		virtual_path: normalizePath(record.virtual_path),
		file_name: record.file_name,
		is_folder: record.is_folder ? 1 : 0,
		size: record.size,
		mime_type: resolveMimeType(record),
		cloud_account_id: record.cloud_account_id,
		remote_file_id: record.remote_file_id,
		remote_parent_id: record.remote_parent_id || null,
		remote_created_time: record.remote_created_time || null,
		remote_modified_time: record.remote_modified_time || null,
	};

	db.prepare(`
    INSERT INTO file_metadata (
			id, user_id, virtual_path, file_name, is_folder, size, mime_type,
			cloud_account_id, remote_file_id, remote_parent_id, remote_created_time, remote_modified_time
    ) VALUES (
			@id, @user_id, @virtual_path, @file_name, @is_folder, @size, @mime_type,
			@cloud_account_id, @remote_file_id, @remote_parent_id, @remote_created_time, @remote_modified_time
    )
  `).run(payload);

	return getFileById(payload.user_id, payload.id);
}

export function getFileById(userId, id) {
	const row = db
		.prepare(`
      SELECT fm.*, ca.provider, ca.email
      FROM file_metadata fm
      LEFT JOIN cloud_accounts ca ON ca.id = fm.cloud_account_id
			WHERE fm.user_id = ? AND fm.id = ?
    `)
		.get(userId, id);

	if (!row) return row;
	return buildDisplayNames([row])[0];
}

export function getFileByRemoteId(userId, cloudAccountId, remoteFileId) {
	const row = db
		.prepare(`
      SELECT fm.*, ca.provider, ca.email
      FROM file_metadata fm
      LEFT JOIN cloud_accounts ca ON ca.id = fm.cloud_account_id
			WHERE fm.user_id = ? AND fm.cloud_account_id = ? AND fm.remote_file_id = ?
    `)
		.get(userId, cloudAccountId, remoteFileId);

	if (!row) return row;
	return buildDisplayNames([row])[0];
}

export function listAllFiles(userId) {
	return db.prepare('SELECT * FROM file_metadata WHERE user_id = ?').all(userId);
}

export function listStarredFiles(userId) {
	const rows = db
		.prepare(`
			SELECT fm.*, ca.provider, ca.email
			FROM file_metadata fm
			INNER JOIN cloud_accounts ca ON ca.id = fm.cloud_account_id
			WHERE fm.user_id = ? AND COALESCE(fm.is_starred, 0) = 1 AND fm.deleted_at IS NULL AND ca.status = 'active'
			ORDER BY COALESCE(fm.remote_modified_time, fm.remote_created_time) DESC,
				fm.updated_at DESC,
				fm.file_name COLLATE NOCASE ASC
		`)
		.all(userId);

	return buildDisplayNames(rows);
}

export function listRecentFiles(userId) {
	const rows = db
		.prepare(`
			SELECT fm.*, ca.provider, ca.email
			FROM file_metadata fm
			INNER JOIN cloud_accounts ca ON ca.id = fm.cloud_account_id
			WHERE fm.user_id = ?
				AND fm.is_folder = 0
				AND fm.deleted_at IS NULL
				AND ca.status = 'active'
			ORDER BY COALESCE(fm.remote_modified_time, fm.remote_created_time) DESC,
				fm.updated_at DESC,
				fm.file_name COLLATE NOCASE ASC
		`)
		.all(userId);

	return buildDisplayNames(rows);
}

export function updateFileStarredByRemoteId(userId, cloudAccountId, remoteFileId, isStarred) {
	return db.prepare(`
		UPDATE file_metadata
		SET is_starred = ?, updated_at = CURRENT_TIMESTAMP
		WHERE user_id = ? AND cloud_account_id = ? AND remote_file_id = ?
	`).run(isStarred ? 1 : 0, userId, cloudAccountId, remoteFileId);
}

export function setFileStarred(userId, fileId, isStarred) {
	return db.prepare(`
		UPDATE file_metadata
		SET is_starred = ?, updated_at = CURRENT_TIMESTAMP
		WHERE user_id = ? AND id = ?
	`).run(isStarred ? 1 : 0, userId, fileId);
}

export function softDeleteFile(userId, fileId) {
	const file = db.prepare('SELECT id, virtual_path FROM file_metadata WHERE user_id = ? AND id = ? AND deleted_at IS NULL').get(userId, fileId);
	if (!file) return null;
	db.prepare(`
		UPDATE file_metadata
		SET deleted_at = CURRENT_TIMESTAMP, original_path = ?, updated_at = CURRENT_TIMESTAMP
		WHERE user_id = ? AND id = ?
	`).run(file.virtual_path, userId, fileId);
	return file;
}

export function restoreFile(userId, fileId) {
	const file = db.prepare('SELECT id, original_path FROM file_metadata WHERE user_id = ? AND id = ? AND deleted_at IS NOT NULL').get(userId, fileId);
	if (!file) return null;
	const targetPath = file.original_path || '/';
	db.prepare(`
		UPDATE file_metadata
		SET deleted_at = NULL, virtual_path = ?, original_path = NULL, updated_at = CURRENT_TIMESTAMP
		WHERE user_id = ? AND id = ?
	`).run(targetPath, userId, fileId);
	return { id: fileId, virtual_path: targetPath };
}

export function purgeFileRecord(userId, fileId) {
	return db.prepare('DELETE FROM file_metadata WHERE user_id = ? AND id = ?').run(userId, fileId);
}

export function listTrashFiles(userId) {
	const rows = db
		.prepare(`
			SELECT fm.*, ca.provider, ca.email
			FROM file_metadata fm
			LEFT JOIN cloud_accounts ca ON ca.id = fm.cloud_account_id
			WHERE fm.user_id = ? AND fm.deleted_at IS NOT NULL
			ORDER BY fm.deleted_at DESC, fm.file_name COLLATE NOCASE ASC
		`)
		.all(userId);
	return buildDisplayNames(rows);
}

export function updateFilePath(userId, fileId, nextPath) {
	return db.prepare(`
		UPDATE file_metadata
		SET virtual_path = ?, updated_at = CURRENT_TIMESTAMP
		WHERE user_id = ? AND id = ?
	`).run(normalizePath(nextPath), userId, fileId);
}

export function updateFileName(userId, fileId, nextName) {
	return db.prepare(`
		UPDATE file_metadata
		SET file_name = ?, updated_at = CURRENT_TIMESTAMP
		WHERE user_id = ? AND id = ?
	`).run(nextName, userId, fileId);
}

export function getFileRowById(userId, fileId) {
	return db.prepare('SELECT * FROM file_metadata WHERE user_id = ? AND id = ?').get(userId, fileId);
}

export function replaceFilesForAccount(userId, cloudAccountId, records) {
	const normalizedRecords = records.map((record) => ({
		id: record.id || randomUUID(),
		user_id: userId,
		virtual_path: normalizePath(record.virtual_path),
		file_name: record.file_name,
		is_folder: record.is_folder ? 1 : 0,
		is_starred: record.is_starred ? 1 : 0,
		size: Number(record.size || 0),
		mime_type: resolveMimeType(record),
		cloud_account_id: cloudAccountId,
		remote_file_id: record.remote_file_id,
		remote_parent_id: record.remote_parent_id || null,
		remote_created_time: record.remote_created_time || null,
		remote_modified_time: record.remote_modified_time || null,
	}));

	const replace = db.transaction(() => {
		// custom: preserve trashed records (deleted_at IS NOT NULL) so sync never wipes the trash
		db.prepare('DELETE FROM file_metadata WHERE user_id = ? AND cloud_account_id = ? AND deleted_at IS NULL').run(userId, cloudAccountId);

		if (!normalizedRecords.length) {
			return;
		}

		const insert = db.prepare(`
      INSERT INTO file_metadata (
				id, user_id, virtual_path, file_name, is_folder, is_starred, size, mime_type,
				cloud_account_id, remote_file_id, remote_parent_id, remote_created_time, remote_modified_time
      ) VALUES (
				@id, @user_id, @virtual_path, @file_name, @is_folder, @is_starred, @size, @mime_type,
				@cloud_account_id, @remote_file_id, @remote_parent_id, @remote_created_time, @remote_modified_time
      )
    `);

		normalizedRecords.forEach((record) => insert.run(record));
	});

	replace();
}

export function clearFilesForAccount(userId, cloudAccountId) {
	// custom: keep trashed records so an auth failure never empties the trash
	db.prepare('DELETE FROM file_metadata WHERE user_id = ? AND cloud_account_id = ? AND deleted_at IS NULL').run(userId, cloudAccountId);
}

export function upsertFileMetadata(record) {
	db.prepare(`
    INSERT INTO file_metadata (
			id, user_id, virtual_path, file_name, is_folder, is_starred, size, mime_type,
			cloud_account_id, remote_file_id, remote_parent_id, remote_created_time, remote_modified_time
    ) VALUES (
			@id, @user_id, @virtual_path, @file_name, @is_folder, @is_starred, @size, @mime_type,
			@cloud_account_id, @remote_file_id, @remote_parent_id, @remote_created_time, @remote_modified_time
    )
    ON CONFLICT(id) DO UPDATE SET
			user_id = excluded.user_id,
      virtual_path = excluded.virtual_path,
      file_name = excluded.file_name,
      is_folder = excluded.is_folder,
			is_starred = excluded.is_starred,
      size = excluded.size,
      mime_type = excluded.mime_type,
      cloud_account_id = excluded.cloud_account_id,
      remote_file_id = excluded.remote_file_id,
      remote_parent_id = excluded.remote_parent_id,
	  remote_created_time = excluded.remote_created_time,
	  remote_modified_time = excluded.remote_modified_time,
      updated_at = CURRENT_TIMESTAMP
  `).run({
		...record,
		virtual_path: normalizePath(record.virtual_path),
		user_id: record.user_id,
		is_folder: record.is_folder ? 1 : 0,
		is_starred: record.is_starred ? 1 : 0,
	});
}

export function listDirectoryTree(userId) {
	return db
		.prepare(`
      SELECT id, virtual_path, file_name, is_folder, cloud_account_id
      FROM file_metadata
      WHERE user_id = ?
      ORDER BY virtual_path, is_folder DESC, file_name
    `)
		.all(userId);
}
