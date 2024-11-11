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

    let content = `# ${project.github.org_name}/${project.github.repo_name}`;

    let i = 0;
    while (true) {
      const pr = openPullRequests[i];
      if (!pr) {
        break;
      }
      i++;
      const review = prReviews.find((review) =>
        review.pullRequestId === pr.id.toString()
      );
      if (!review) {
        continue;
      }
      // <@123> está revisando [title](url)
      // **Ninguém** está revisando [title](url)
      const line = `\n${userMention(review.reviewerDiscordId)} está revisando ${
        hyperlink(pr.title, pr.html_url)
      }`;
      if (content.length + line.length > 4000) {
        break;
      }
      content += line;
    }

    sendMessage(ctx.discord.bot, project.discord.summary_channel_id, {
      content,
    });
  }
}
