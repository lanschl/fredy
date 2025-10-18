// Migration: there needs to be a unique index on job_id and hash as only
// this makes the listing indeed unique
// Migration: Adding an active flag to listings to track their online status.

export function up(db) {
  db.exec(`
    ALTER TABLE listings ADD COLUMN is_active INTEGER DEFAULT 1;
  `);
}
