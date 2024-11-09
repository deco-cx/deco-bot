import type { DrizzleContext } from "../deps/deps.ts";
import type { AppContext } from "../mod.ts";

export default async function loader(
  _props: unknown,
  _req: Request,
  ctx: AppContext & DrizzleContext,
) {
  const drizzle = await ctx.invoke.records.loaders.drizzle();
  return {
    discord_token: ctx.discord.token?.get() ? "✅" : "❌",
    bot: ctx.discord?.bot?.id?.toString(),
    github_token: ctx.githubToken?.get() ? "✅" : "❌",
    projects: ctx.projects.map((p) => p.github.repo_name),
    drizzle: drizzle ? "✅" : "❌",
  };
}
