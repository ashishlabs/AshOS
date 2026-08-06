import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";
import type { InboxStatus } from "../../inbox/types";

export function registerInboxCommand(program: Command): void {
  const cmd = program.command("inbox").description("Universal Inbox: capture text/URLs and review them later");

  cmd
    .command("add <content...>")
    .description("Capture a piece of content — auto-classified as text/url/github-repo/youtube/tweet/article/pdf")
    .option("-t, --tags <tags>", "comma-separated extra tags")
    .action(async (content: string[], opts) => {
      const ashos = new AshOS();
      const tags = opts.tags ? String(opts.tags).split(",").map((t: string) => t.trim()).filter(Boolean) : undefined;
      const item = await ashos.inbox.capture(content.join(" "), { tags });
      console.log(`Captured [${item.sourceType}] ${item.id}`);
    });

  cmd
    .command("list")
    .description("List inbox items, newest first")
    .option("-s, --status <status>", 'filter by status: "unread", "reviewed", "archived"')
    .action((opts) => {
      const ashos = new AshOS();
      const items = ashos.inbox.list(opts.status ? { status: opts.status as InboxStatus } : undefined);
      if (items.length === 0) {
        console.log("Inbox is empty. Capture something with `ash inbox add <content>`.");
        return;
      }
      for (const item of items) {
        const preview = item.content.length > 70 ? `${item.content.slice(0, 67)}...` : item.content;
        console.log(`[${item.status}] [${item.sourceType}] ${item.id}  ${preview}`);
      }
    });

  cmd
    .command("show <id>")
    .description("Show full details for one inbox item")
    .action((id: string) => {
      const ashos = new AshOS();
      const item = ashos.inbox.get(id);
      if (!item) {
        console.error(`No inbox item found with id "${id}".`);
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(item, null, 2));
    });

  cmd
    .command("archive <id>")
    .description("Mark an inbox item as archived")
    .action(async (id: string) => {
      const ashos = new AshOS();
      try {
        const item = await ashos.inbox.archive(id);
        console.log(`Archived ${item.id}`);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });

  cmd
    .command("history <id>")
    .description("Show prior versions of an inbox item, newest first")
    .action((id: string) => {
      const ashos = new AshOS();
      const versions = ashos.inbox.history(id);
      if (versions.length === 0) {
        console.log("No prior versions — this item hasn't changed since it was captured.");
        return;
      }
      versions.forEach((version, i) => {
        console.log(`--- version ${versions.length - i} of ${versions.length} (superseded) ---`);
        console.log(JSON.stringify(version, null, 2));
      });
    });
}
