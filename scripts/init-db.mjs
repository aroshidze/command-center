/**
 * Create the schema. Idempotent — safe to run as many times as you like.
 *
 *   npm run init-db
 *
 * Reads DATABASE_URL from .env.local (never from the repo).
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

try {
    process.loadEnvFile(resolve(root, '.env.local'));
} catch {
    console.error('No .env.local found. See docs/SETUP.md.');
    process.exit(1);
}

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is missing from .env.local. See docs/SETUP.md step 1.');
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const schema = readFileSync(resolve(here, 'schema.sql'), 'utf8');

/*
 * The neon() HTTP driver sends one statement per request, so the file is split rather than sent whole.
 * Splitting on ';' is safe here only because the schema contains no functions, triggers or string
 * literals with semicolons in them. If that ever stops being true, switch to the WebSocket Pool driver
 * and send the file as a single script.
 */
const statements = schema
    .split(/;\s*$/m)
    .map(s => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);

let applied = 0;
for (const statement of statements) {
    try {
        await sql.query(statement);
        applied++;
    } catch (e) {
        console.error(`\nFailed on:\n${statement.slice(0, 200)}\n\n${e.message}`);
        process.exit(1);
    }
}

// Verify by reading the schema back, rather than trusting that the statements "ran fine". A check that
// only asserts "no exception was thrown" is the proxy-measurement failure from brief §6.
const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in ('tasks', 'questions', 'notes', 'events', 'agents')
    order by table_name
`;

const found = tables.map(t => t.table_name);
const want = ['agents', 'events', 'notes', 'questions', 'tasks'];
const missing = want.filter(t => !found.includes(t));

if (missing.length) {
    console.error(`\nSchema incomplete. Missing: ${missing.join(', ')}`);
    process.exit(1);
}

console.log(`${applied} statements applied. Tables present: ${found.join(', ')}`);
