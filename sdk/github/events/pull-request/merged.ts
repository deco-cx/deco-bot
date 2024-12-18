import { STATUS_CODE } from "@std/http";
import { threads } from "../../../../db/schema.ts";
import { eq } from "../../../../deps/deps.ts";
import {
  editChannel,
  sendMessage,
  snowflakeToBigint,
} from "../../../../deps/discordeno.ts";
import type { AppContext, Project } from "../../../../mod.ts";
import emojis from "../../../discord/emojis.ts";
import { bold, hyperlink } from "../../../discord/textFormatting.ts";
import { getRandomItem } from "../../../random.ts";
import type { WebhookEvent } from "../../types.ts";

export default async function onPullRequestMerge(
  props: WebhookEvent<"pull-request-closed">,
  project: Project,
  ctx: AppContext,
) {
  const bot = ctx.discord.bot;
  const drizzle = await ctx.invoke.records.loaders.drizzle();
  const { pull_request, repository } = props;

  const owner = pull_request.user;
  const mergedBy = props.pull_request.merged_by ?? owner;

  const theChosenOne = getRandomItem(project.users);

  const threadId = await drizzle
    .select()
    .from(threads)
    .where(eq(threads.pullRequestId, `${pull_request.id}`))
    .then(([thread]) => thread?.id);
  const channelId = threadId || project.discord.pr_channel_id;

  const title = mergedBy.login === owner.login
    ? `${bold(mergedBy.login)} mergeou o próprio PR`
    : `${bold(mergedBy.login)} mergeou o PR feito por ${bold(owner.login)}.`;

  const link = hyperlink(
    bold(`#${pull_request.number} - ${pull_request.title}`),
    pull_request.html_url,
  );

  await sendMessage(bot, channelId, {
    content:
      `${emojis.pullRequest.merged} ${title}\n(${repository.full_name}) ${link}`,
    allowedMentions: {
      users: theChosenOne ? [snowflakeToBigint(theChosenOne.discordId)] : [],
    },
  });

  if (threadId) {
    await editChannel(bot, threadId, {
      archived: true,
    }).catch(console.error);
    await drizzle.delete(threads).where(eq(threads.id, threadId));
  }

  return new Response(null, { status: STATUS_CODE.NoContent });
}
