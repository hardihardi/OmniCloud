// custom (custom3): daftar email super admin — diisi dari env SUPER_ADMIN_EMAILS (dipisah koma).
export const SUPER_ADMIN_EMAILS = new Set(
	String(process.env.SUPER_ADMIN_EMAILS || '')
		.split(',')
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean),
);
