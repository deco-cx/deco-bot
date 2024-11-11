import { STATUS_CODE } from "@std/http/status";
import { reviews, threads } from "../../../../db/schema.ts";
import { and, eq } from "../../../../deps/deps.ts";
import { sendMessage, snowflakeToBigint } from "../../../../deps/discordeno.ts";
import { AppContext, Project } from "../../../../mod.ts";
import {
  bold,
  hyperlink,
  timestamp,
  userMention,
} from "../../../discord/textFormatting.ts";
import getUserByGithubUsername from "../../../user/getUserByGithubUsername.ts";
import { WebhookEvent } from "../../types.ts";

export default async function onReviewRequested(
  props: WebhookEvent<"pull-request-review-requested">,
  project: Project,
  ctx: AppContext,
) {
  const bot = ctx.discord.bot;
  const { pull_request, repository, requested_reviewer, sender } = props;

  const drizzle = await ctx.invoke.records.loaders.drizzle();

  const seconds = Math.floor(
    new Date(pull_request.created_at).getTime() / 1000,
  );

  const requestedUser = requested_reviewer?.login &&
    await getUserByGithubUsername({
      username: requested_reviewer?.login,
    }, ctx);

  if (requestedUser) {
    await drizzle.delete(reviews).where(
      and(
        eq(reviews.pullRequestId, pull_request.id.toString()),
        eq(reviews.type, "auto"),
      ),
    );

    await drizzle.insert(reviews).values({
      reviewerGithubUsername: requestedUser.githubUsername,
      reviewerDiscordId: requestedUser.discordId,
      pullRequestId: pull_request.id.toString(),
      pullRequestUrl: pull_request.html_url,
      type: "requested",
    });
  }

  const threadId = await drizzle
    .select()
    .from(threads)
    .where(eq(threads.pullRequestId, pull_request.id.toString()))
    .then(([thread]) => thread?.id) || project.discord.pr_channel_id;

  const requestedUserMention = requestedUser
    ? userMention(requestedUser.discordId)
    : requested_reviewer?.login
    ? bold(requested_reviewer.login)
    : "";
  const title = `${
    bold(sender.login)
  } pediu para ${requestedUserMention} revisar um PR`;
  const link = hyperlink(
    bold(`#${pull_request.number} - ${pull_request.title}`),
    pull_request.html_url,
  );

  await sendMessage(bot, threadId, {
    content: `${title}\n(${repository.full_name}) ${link} - ${
      timestamp(seconds, "R")
    }`,
    allowedMentions: {
      users: requestedUser ? [snowflakeToBigint(requestedUser.discordId)] : [],
    },
  });

  return new Response(null, { status: STATUS_CODE.NoContent });
}
