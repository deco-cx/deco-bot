import { STATUS_CODE } from "@std/http/status";
import { reviews } from "../../db/schema.ts";
import { inArray } from "../../deps/deps.ts";
import { sendMessage } from "../../deps/discordeno.ts";
import type { AppContext } from "../../mod.ts";
import { hyperlink, userMention } from "../../sdk/discord/textFormatting.ts";
import { isDraft } from "../../sdk/github/utils.ts";

export default async function action(
  _props: unknown,
  req: Request,
  ctx: AppContext,
) {
  if (req.method !== "GET") {
    return new Response(null, { status: STATUS_CODE.MethodNotAllowed });
  }

  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== ctx.cronJobSecret?.get()) {
    return new Response(null, { status: STATUS_CODE.Unauthorized });
  }

  const drizzle = await ctx.invoke.records.loaders.drizzle();

  for (const project of ctx.projects.filter((project) => project.active)) {
    const openPullRequests = (await ctx.githubClient.getPullRequests({
      owner: project.github.org_name,
      repo: project.github.repo_name,
      state: "open",
      direction: "desc",
      sort: "created",
    })).filter((pr) => !isDraft(pr.title));

    if (!openPullRequests.length) {
      continue;
    }

    const prReviews = await drizzle
      .select()
      .from(reviews)
      .where(
        inArray(
          reviews.pullRequestId,
          openPullRequests.map((pr) => pr.id.toString()),
        ),
      );

    let content = "";

    for (const pr of openPullRequests) {
      const reviews = prReviews.filter((review) =>
        review.pullRequestId === pr.id.toString()
      );
      if (!reviews.length) {
        continue;
      }
      const mentions = reviews
        .map((review) => userMention(review.reviewerDiscordId))
        .join(", ");
      const line = `\n${mentions} ${
        reviews.length > 1 ? "estão" : "está"
      } revisando ${hyperlink(pr.title, pr.html_url)}`;
      if (content.length + line.length > 4000) {
        break;
      }
      content += line;
    }

    if (!content) {
      continue;
    }

    sendMessage(ctx.discord.bot, project.discord.summary_channel_id, {
      content:
        `### ${project.github.org_name}/${project.github.repo_name}\n${content}`,
    });
  }
}
