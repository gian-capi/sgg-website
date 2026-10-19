/**
 * Creates the first admin account.
 *   npm run seed -- you@example.com "Your Name"
 * Prints a generated password; change it after signing in.
 */
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { db } from './db.js';
import { createUser } from './auth.js';

function generatePassword() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(18))
    .map((b) => alphabet[b % alphabet.length])
    .join('');
}

export function seedAdmin(email, name, password) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    console.log(`User ${email} already exists (id ${existing.id}). Nothing to do.`);
    return null;
  }
  const pw = password || generatePassword();
  const user = createUser({ email, password: pw, name: name || '', role: 'owner' });
  console.log('\n  Admin account created');
  console.log(`  Email:    ${user.email}`);
  console.log(`  Password: ${pw}`);
  console.log('  Role:     owner\n  Change the password after your first sign-in.\n');
  return { user, password: pw };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const email = process.argv[2] || 'admin@signaturegalleries.com';
  const name = process.argv[3] || 'SGG Admin';
  seedAdmin(email, name, process.env.ADMIN_PASSWORD);
}
