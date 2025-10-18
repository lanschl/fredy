// Migration: Adding an active flag to listings to track their online status.

export function up(db) {
  db.exec(`
    ALTER TABLE listings ADD COLUMN is_active INTEGER DEFAULT 1;
  `);
}
