import {
  integer,
  sqliteTable,
  text,
} from "npm:drizzle-orm@0.30.10/sqlite-core";

export const reviews = sqliteTable("reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reviewerGithubUsername: text("reviewer_github_username").notNull(),
  reviewerDiscordId: text("reviewer_discord_id").notNull(),
  pullRequestId: text("pull_request_id").notNull(),
  pullRequestUrl: text("pull_request_url").notNull(),
  type: text("type").notNull(),
});

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  pullRequestId: text("pull_request_id").notNull(),
});
