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
import { WebhookEvent } from "../../types.ts";
import _emojis from "../../../discord/emojis.ts";

type ReviewState = "commented" | "changes_requested" | "approved";

const actions: Record<ReviewState, string> = {
  commented: "comentou no PR de",
  changes_requested: "pediu alterações no PR de",
  approved: "aprovou o PR de",
};

const emojis = {
  commented: _emojis.pullRequest.comment,
  changes_requested: _emojis.pullRequest.changesRequested,
  approved: _emojis.pullRequest.approved,
};

export default async function onReviewSubmitted(
  props: WebhookEvent<"pull-request-review-submitted">,
  project: Project,
  ctx: AppContext,
) {
  const bot = ctx.discord.bot;
  const { pull_request, repository, review, sender } = props;

  const owner = pull_request.user;
  if (!owner || owner.login === sender.login) {
    return new Response(null, { status: STATUS_CODE.NoContent });
  }

  const drizzle = await ctx.invoke.records.loaders.drizzle();
  const ownerDiscordId = project.users.find(
    (user) => user.githubUsername === owner.login,
  )?.discordId;

  const seconds = Math.floor(
    new Date(pull_request.created_at).getTime() / 1000,
  );

  const threadId = await drizzle
    .select()
    .from(threads)
    .where(eq(threads.pullRequestId, pull_request.id.toString()))
    .then(([thread]) => thread?.id) || project.discord.pr_channel_id;

  await drizzle.delete(reviews).where(
    and(
      eq(reviews.pullRequestId, pull_request.id.toString()),
      eq(reviews.reviewerGithubUsername, sender.login),
    ),
  );

  const ownerMention = ownerDiscordId
    ? ` ${userMention(ownerDiscordId)}`
    : owner.login;

  const state = review.state as ReviewState;
  const action = actions[state];
  const emoji = emojis[state];
  const header = `${emoji} ${bold(sender.login)} ${action} ${ownerMention}`;
  const link = hyperlink(
    bold(`#${pull_request.number} - ${pull_request.title}`),
    pull_request.html_url,
  );

  await sendMessage(bot, threadId, {
    content: `${header}\n(${repository.full_name}) ${link} - ${
      timestamp(seconds, "R")
    }`,
    allowedMentions: {
      users: ownerDiscordId ? [snowflakeToBigint(ownerDiscordId)] : [],
    },
  });

  return new Response(null, { status: STATUS_CODE.NoContent });
}
