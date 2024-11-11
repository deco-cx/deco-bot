import { STATUS_CODE } from "@std/http/status";
import type { WorkflowProps } from "apps/workflows/actions/start.ts";
import { reviews, threads } from "../../../../db/schema.ts";
import {
  sendMessage,
  snowflakeToBigint,
  startThreadWithMessage,
} from "../../../../deps/discordeno.ts";
import type { AppContext, AppManifest, Project } from "../../../../mod.ts";
import type { ProjectUser } from "../../../../types.ts";
import emojis from "../../../discord/emojis.ts";
import {
  bold,
  hyperlink,
  timestamp,
  userMention,
} from "../../../discord/textFormatting.ts";
import { getRandomItem } from "../../../random.ts";
import type { WebhookEvent } from "../../types.ts";
import { isDraft } from "../../utils.ts";

export default async function onPullRequestOpen(
  props: WebhookEvent<"pull-request-opened" | "pull-request-edited">,
  project: Project,
  ctx: AppContext,
) {
  if (isDraft(props.pull_request.title)) {
    return new Response(null, { status: STATUS_CODE.NoContent });
  }

  const { pull_request, repository } = props;
  const bot = ctx.discord.bot;
  const drizzle = await ctx.invoke.records.loaders.drizzle();

  const owner = pull_request.user;
  const reviewer = getRandomItem<ProjectUser | undefined>(
    project.users.filter((user) => user.githubUsername !== owner.login),
  );

  const seconds = Math.floor(
    new Date(pull_request.created_at).getTime() / 1000,
  );
  const channelId = project.discord.pr_channel_id;

  const reviewerMention = reviewer
    ? `${userMention(reviewer.discordId)} | `
    : "";
  const title = `${emojis.pullRequest.open} ${
    bold(owner.login)
  } abriu um novo PR`;
  const link = hyperlink(
    bold(`#${pull_request.number} - ${pull_request.title}`),
    pull_request.html_url,
  );

  const message = await sendMessage(
    bot,
    channelId,
    {
      content:
        `${reviewerMention}${title}\n(${repository.full_name}) ${link} - ${
          timestamp(seconds, "R")
        }`,
      allowedMentions: {
        users: reviewer ? [snowflakeToBigint(reviewer.discordId)] : [],
      },
    },
  );

  const thread = await startThreadWithMessage(bot, channelId, message.id, {
    name: `Pull Request: ${pull_request.title}`.slice(0, 100),
    autoArchiveDuration: 1440,
    reason: "Review Pull Request Thread",
  });

  const threadId = thread.id.toString();
  await drizzle.insert(threads).values({
    id: threadId,
    pullRequestId: pull_request.id.toString(),
  });

  if (reviewer) {
    await drizzle.insert(reviews).values({
      reviewerGithubUsername: reviewer.githubUsername,
      reviewerDiscordId: reviewer.discordId,
      pullRequestId: pull_request.id.toString(),
      pullRequestUrl: pull_request.html_url,
      type: "auto",
    });

    if (ctx.confirmPullRequestReview) {
      const reviewers = project.users.filter((user) =>
        user.githubUsername !== owner.login &&
        user.githubUsername !== reviewer?.githubUsername
      );

      const workflowProps: WorkflowProps<
        "github-bot/workflows/waitForReviewer.ts",
        AppManifest
      > = {
        key: "github-bot/workflows/waitForReviewer.ts",
        id: `review-pr-${message.id}`,
        props: {},
        args: [{
          channelId: threadId,
          reviewer,
          reviewers,
        }],
      };

      await ctx.invoke.workflows.actions.start(workflowProps);
    }
  }

  return new Response(null, { status: STATUS_CODE.NoContent });
}
