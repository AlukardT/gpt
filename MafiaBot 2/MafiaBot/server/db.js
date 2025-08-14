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
const db = drizzle({ client: pool, schema });

/**
 * Ensures that all required tables exist in the database.  This function
 * creates the core tables for players, events, registrations and active games
 * if they do not already exist.  It runs automatically on module import.
 */
async function ensureTables() {
  const client = await pool.connect();
  try {
    // Drop old tables if they exist to ensure schema consistency
    await client.query(`DROP TABLE IF EXISTS active_games`);
    await client.query(`DROP TABLE IF EXISTS event_registrations`);
    await client.query(`DROP TABLE IF EXISTS events`);
    await client.query(`DROP TABLE IF EXISTS user_profiles`);

    // Recreate user_profiles table with the desired schema
    await client.query(`
      CREATE TABLE user_profiles (
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
    // Recreate events table
    await client.query(`
      CREATE TABLE events (
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
    // Recreate event_registrations table
    await client.query(`
        CREATE TABLE event_registrations (
          id SERIAL PRIMARY KEY,
          event_id INTEGER REFERENCES events(id) NOT NULL,
          user_id TEXT NOT NULL,
          username TEXT,
          player_count INTEGER DEFAULT 1 NOT NULL,
          registered_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
    `);
    // Recreate active_games table
    await client.query(`
        CREATE TABLE active_games (
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