import { Router } from 'express';
import { resolveShareToken, isPreviewable } from '../services/shareService.js';

// custom4: PUBLIC share endpoints — no auth, token is the capability.
const router = Router();

function resolveOr404(req, res) {
	const ctx = resolveShareToken(req.params.token);
	if (!ctx) {
		res.status(404).json({ error: 'Share link not found or no longer available' });
		return null;
	}
	return ctx;
}

function safeFileName(name) {
	return String(name || 'file').replace(/["\\\r\n]/g, '_');
}

// Public metadata (for the /s/:token landing page)
router.get('/share/:token', (req, res) => {
	const ctx = resolveOr404(req, res);
	if (!ctx) return;
	const { file } = ctx;
	return res.json({
		fileName: file.file_name,
		size: Number(file.size || 0),
		mimeType: file.mime_type || 'application/octet-stream',
		previewable: isPreviewable(file.mime_type) && !file.is_folder,
		modifiedTime: file.remote_modified_time || file.remote_created_time || null,
		ownerEmail: file.email || null,
	});
});

// Public preview stream (inline, images/video/audio/pdf/text)
router.get('/share/:token/preview', async (req, res) => {
	const ctx = resolveOr404(req, res);
	if (!ctx) return;
	const { file, adapter } = ctx;
	const mimeType = file.mime_type || 'application/octet-stream';
	if (file.is_folder || !isPreviewable(mimeType)) {
		return res.status(415).json({ error: 'Preview is not supported for this file' });
	}
	try {
		const stream = await adapter.getDownloadStream(file);
		res.setHeader('Content-Disposition', `inline; filename="${safeFileName(file.file_name)}"`);
		res.setHeader('Content-Type', mimeType);
		if (file.size) res.setHeader('Content-Length', String(file.size));
		res.setHeader('Cache-Control', 'private, max-age=300');
		return stream.pipe(res);
	} catch (error) {
		return res.status(502).json({ error: 'Unable to fetch file from storage provider' });
	}
});

// Public download (attachment)
router.get('/share/:token/download', async (req, res) => {
	const ctx = resolveOr404(req, res);
	if (!ctx) return;
	const { file, adapter } = ctx;
	try {
		const stream = await adapter.getDownloadStream(file);
		res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(file.file_name)}"`);
		res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
		if (file.size) res.setHeader('Content-Length', String(file.size));
		return stream.pipe(res);
	} catch (error) {
		return res.status(502).json({ error: 'Unable to fetch file from storage provider' });
	}
});

export default router;
