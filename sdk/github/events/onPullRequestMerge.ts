import { STATUS_CODE } from "@std/http";
import { threads } from "../../../db/schema.ts";
import { type DrizzleContext, eq } from "../../../deps/deps.ts";
import {
  editChannel,
  sendMessage,
  snowflakeToBigint,
} from "../../../deps/discordeno.ts";
import type { AppContext, Project } from "../../../mod.ts";
import type { WebhookEvent } from "../../../sdk/github/types.ts";
import { bold, hyperlink } from "../../discord/textFormatting.ts";
import { getPullRequestThreadId } from "../../kv.ts";
import { getRandomItem } from "../../random.ts";

export default async function onPullRequestMerge(
  props: WebhookEvent<"pull-request-closed">,
  project: Project,
  ctx: AppContext & DrizzleContext,
) {
  const bot = ctx.discord.bot;
  const { pull_request, repository } = props;

  const owner = pull_request.user;
  const mergedBy = props.pull_request.merged_by ?? owner;

  const theChosenOne = getRandomItem(project.users);

  const threadId = await getPullRequestThreadId(`${pull_request.id}`);
  const channelId = threadId || project.discord.pr_channel_id;

  const title = mergedBy.login === owner.login
    ? `${bold(mergedBy.login)} mergeou o próprio PR`
    : `${bold(mergedBy.login)} mergeou o PR feito por ${bold(owner.login)}.`;

  const link = hyperlink(
    bold(`#${pull_request.number} - ${pull_request.title}`),
    pull_request.html_url,
  );

  await sendMessage(bot, channelId, {
    content: `${title}\n(${repository.full_name}) ${link}`,
    allowedMentions: {
      users: theChosenOne ? [snowflakeToBigint(theChosenOne.discordId)] : [],
    },
  });

  if (threadId) {
    await editChannel(bot, threadId, {
      archived: true,
    }).catch(console.error);
    const drizzle = await ctx.invoke.records.loaders.drizzle();
    await drizzle.delete(threads).where(eq(threads.id, threadId));
  }

  return new Response(null, { status: STATUS_CODE.NoContent });
}
