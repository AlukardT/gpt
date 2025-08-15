const { Pool } = require('pg');
// Use the Node Postgres driver for drizzle-orm.  The `drizzle-orm/pg` subpath
// isn't exposed by the library and will throw "ERR_PACKAGE_PATH_NOT_EXPORTED".
// See https://orm.drizzle.team/docs/get-started-postgresql for the correct import.
const { drizzle } = require('drizzle-orm/node-postgres');
const schema = require("../shared/schema");

// Ensure DATABASE_URL is provided
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Create a connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Create a drizzle ORM client
const db = drizzle(pool, { schema });

/**
 * Ensures that all required tables exist in the database without destructive drops.
 * Uses CREATE TABLE IF NOT EXISTS to avoid data loss on startup.
 */
async function ensureTables() {
  const client = await pool.connect();
  try {
    // User profiles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        nickname TEXT,
        real_name TEXT,
        avatar_url TEXT,
        is_registered BOOLEAN DEFAULT FALSE NOT NULL,
        games_played INTEGER DEFAULT 0 NOT NULL,
        games_won INTEGER DEFAULT 0 NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        last_active TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        location TEXT NOT NULL,
        address TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        capacity INTEGER NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        is_active BOOLEAN DEFAULT TRUE NOT NULL
      )
    `);

    // Event registrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_registrations (
        id SERIAL PRIMARY KEY,
        event_id INTEGER REFERENCES events(id) NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT,
        player_count INTEGER DEFAULT 1 NOT NULL,
        registered_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Active games table
    await client.query(`
      CREATE TABLE IF NOT EXISTS active_games (
        id SERIAL PRIMARY KEY,
        event_id INTEGER REFERENCES events(id) NOT NULL,
        phase TEXT DEFAULT 'setup' NOT NULL,
        day_number INTEGER DEFAULT 1 NOT NULL,
        is_active BOOLEAN DEFAULT TRUE NOT NULL,
        game_data JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        last_updated TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
  } finally {
    client.release();
  }
}

// Immediately ensure tables exist when module is loaded
ensureTables().catch((err) => {
  console.error('Error ensuring database tables', err);
});

module.exports = { pool, db };