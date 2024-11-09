import { STATUS_CODE } from "@std/http/status";
import { sendMessage } from "../../../deps/discordeno.ts";
import type { AppContext, Project } from "../../../mod.ts";
import { bold, hyperlink, timestamp } from "../../discord/textFormatting.ts";
import type { WebhookEvent } from "../types.ts";
import { isDraft } from "../utils.ts";

export default async function onIssueClosed(
  props: WebhookEvent<"issues-closed">,
  project: Project,
  ctx: AppContext,
) {
  const bot = ctx.discord.bot;
  const { issue, repository, sender } = props;

  if (isDraft(issue.title)) {
    return new Response(null, { status: STATUS_CODE.NoContent });
  }

  const seconds = Math.floor(
    new Date(issue.created_at).getTime() / 1000,
  );
  const channelId = project.discord.pr_channel_id;

  const selfClosed = issue.user.login === sender.login;
  const title = selfClosed
    ? `${bold(sender.login)} fechou a própria Issue`
    : `${bold(sender.login)} fechou a issue de ${bold(issue.user.login)}`;

  const link = hyperlink(
    bold(`#${issue.number} - ${issue.title}`),
    issue.html_url,
  );
  await sendMessage(
    bot,
    channelId,
    {
      content: `${title}\n(${repository.full_name}) ${link} - ${
        timestamp(seconds, "R")
      }`,
    },
  );

  return new Response(null, { status: STATUS_CODE.NoContent });
}
