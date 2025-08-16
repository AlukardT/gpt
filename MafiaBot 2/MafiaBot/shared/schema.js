const { pgTable, serial, text, timestamp, integer, boolean, jsonb } = require("drizzle-orm/pg-core");
const { relations } = require("drizzle-orm");

// Events table
const events = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  location: text("location").notNull(),
  address: text("address").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  capacity: integer("capacity").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull()
});

// Event registrations table
const eventRegistrations = pgTable("event_registrations", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => events.id).notNull(),
  userId: text("user_id").notNull(),
  username: text("username"),
  playerCount: integer("player_count").default(1).notNull(),
  registeredAt: timestamp("registered_at").defaultNow().notNull()
});

// User profiles table
const userProfiles = pgTable("user_profiles", {
  id: text("id").primaryKey(), // Telegram user ID
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  nickname: text("nickname"), // Псевдоним для игры
  realName: text("real_name"), // Настоящее имя
  avatarUrl: text("avatar_url"), // URL загруженного аватара
  isRegistered: boolean("is_registered").default(false).notNull(), // Полная регистрация
  gamesPlayed: integer("games_played").default(0).notNull(),
  gamesWon: integer("games_won").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActive: timestamp("last_active").defaultNow().notNull()
});

// Active games table
const activeGames = pgTable("active_games", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => events.id).notNull(),
  phase: text("phase").default("setup").notNull(), // setup, day, night, voting, finished
  dayNumber: integer("day_number").default(1).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  gameData: jsonb("game_data"), // Store players, roles, game state
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdated: timestamp("last_updated").defaultNow().notNull()
});

// Relations
const eventsRelations = relations(events, ({ many }) => ({
  registrations: many(eventRegistrations),
  activeGames: many(activeGames)
}));

const eventRegistrationsRelations = relations(eventRegistrations, ({ one }) => ({
  event: one(events, {
    fields: [eventRegistrations.eventId],
    references: [events.id]
  }),
  user: one(userProfiles, {
    fields: [eventRegistrations.userId],
    references: [userProfiles.id]
  })
}));

const userProfilesRelations = relations(userProfiles, ({ many }) => ({
  registrations: many(eventRegistrations)
}));

const activeGamesRelations = relations(activeGames, ({ one }) => ({
  event: one(events, {
    fields: [activeGames.eventId],
    references: [events.id]
  })
}));

// Types
module.exports = {
  events,
  eventRegistrations,
  userProfiles,
  activeGames,
  eventsRelations,
  eventRegistrationsRelations,
  userProfilesRelations,
  activeGamesRelations
};