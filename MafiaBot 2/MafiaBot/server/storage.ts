import { events, eventRegistrations, userProfiles, activeGames } from "../shared/schema";
import type { Event, InsertEvent, EventRegistration, InsertEventRegistration, UserProfile, InsertUserProfile, ActiveGame, InsertActiveGame } from "../shared/schema";
import { db } from "./db";
import { eq, desc, and, gte } from "drizzle-orm";

export interface IStorage {
  // Events
  createEvent(event: InsertEvent): Promise<Event>;
  getEvents(): Promise<Event[]>;
  getUpcomingEvents(): Promise<Event[]>;
  getEvent(id: number): Promise<Event | undefined>;
  
  // Event Registrations
  registerForEvent(registration: InsertEventRegistration): Promise<EventRegistration>;
  getEventRegistrations(eventId: number): Promise<EventRegistration[]>;
  removeRegistration(eventId: number, userId: string): Promise<boolean>;
  
  // User Profiles
  getUser(id: string): Promise<UserProfile | undefined>;
  getUserByUsername(username: string): Promise<UserProfile | undefined>;
  createUser(user: InsertUserProfile): Promise<UserProfile>;
  updateUser(id: string, updates: Partial<UserProfile>): Promise<UserProfile | undefined>;
  
  // Active Games
  createActiveGame(game: InsertActiveGame): Promise<ActiveGame>;
  getActiveGame(eventId: number): Promise<ActiveGame | undefined>;
  updateActiveGame(id: number, updates: Partial<ActiveGame>): Promise<ActiveGame | undefined>;
  getActiveGames(): Promise<ActiveGame[]>;
}

export class DatabaseStorage implements IStorage {
  // Events
  async createEvent(event: InsertEvent): Promise<Event> {
    const [newEvent] = await db.insert(events).values(event).returning();
    return newEvent;
  }
  
  async getEvents(): Promise<Event[]> {
    return await db.select().from(events).orderBy(desc(events.createdAt));
  }
  
  async getUpcomingEvents(): Promise<Event[]> {
    const now = new Date().toISOString().split('T')[0]; // Today's date in YYYY-MM-DD format
    return await db.select().from(events)
      .where(and(
        eq(events.isActive, true),
        gte(events.date, now)
      ))
      .orderBy(events.date, events.time);
  }
  
  async getEvent(id: number): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }
  
  // Event Registrations
  async registerForEvent(registration: InsertEventRegistration): Promise<EventRegistration> {
    const [newRegistration] = await db.insert(eventRegistrations).values(registration).returning();
    return newRegistration;
  }
  
  async getEventRegistrations(eventId: number): Promise<EventRegistration[]> {
    return await db.select().from(eventRegistrations).where(eq(eventRegistrations.eventId, eventId));
  }
  
  async removeRegistration(eventId: number, userId: string): Promise<boolean> {
    const result = await db.delete(eventRegistrations)
      .where(and(
        eq(eventRegistrations.eventId, eventId),
        eq(eventRegistrations.userId, userId)
      ));
    return result.rowCount > 0;
  }
  
  // User Profiles
  async getUser(id: string): Promise<UserProfile | undefined> {
    const [user] = await db.select().from(userProfiles).where(eq(userProfiles.id, id));
    return user;
  }
  
  async getUserByUsername(username: string): Promise<UserProfile | undefined> {
    const [user] = await db.select().from(userProfiles).where(eq(userProfiles.username, username));
    return user;
  }
  
  async createUser(user: InsertUserProfile): Promise<UserProfile> {
    const [newUser] = await db.insert(userProfiles).values(user).returning();
    return newUser;
  }
  
  async updateUser(id: string, updates: Partial<UserProfile>): Promise<UserProfile | undefined> {
    const [updatedUser] = await db.update(userProfiles)
      .set({ ...updates, lastActive: new Date() })
      .where(eq(userProfiles.id, id))
      .returning();
    return updatedUser;
  }
  
  // Active Games
  async createActiveGame(game: InsertActiveGame): Promise<ActiveGame> {
    const [newGame] = await db.insert(activeGames).values(game).returning();
    return newGame;
  }
  
  async getActiveGame(eventId: number): Promise<ActiveGame | undefined> {
    const [game] = await db.select().from(activeGames)
      .where(and(
        eq(activeGames.eventId, eventId),
        eq(activeGames.isActive, true)
      ));
    return game;
  }
  
  async updateActiveGame(id: number, updates: Partial<ActiveGame>): Promise<ActiveGame | undefined> {
    const [updatedGame] = await db.update(activeGames)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(activeGames.id, id))
      .returning();
    return updatedGame;
  }
  
  async getActiveGames(): Promise<ActiveGame[]> {
    return await db.select().from(activeGames).where(eq(activeGames.isActive, true));
  }
}

export const storage = new DatabaseStorage();