import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";
import type { VaultStatus } from "../../vault/types";

export function registerVaultCommand(program: Command): void {
  const cmd = program.command("vault").description("Knowledge Vault: curated, long-form notes with links between them");

  cmd
    .command("add <title> <content...>")
    .description("Create a new note (everything after the title is the note content)")
    .option("-t, --tags <tags>", "comma-separated tags")
    .action(async (title: string, content: string[], opts) => {
      const ashos = new AshOS();
      const tags = opts.tags ? String(opts.tags).split(",").map((t: string) => t.trim()).filter(Boolean) : undefined;
      const note = await ashos.vault.create(title, content.join(" "), { tags });
      console.log(`Created note ${note.id}`);
    });

  cmd
    .command("promote <inboxId>")
    .description("Promote an existing inbox item into a vault note")
    .option("--title <title>", "override the note title")
    .action(async (inboxId: string, opts) => {
      const ashos = new AshOS();
      try {
        const note = await ashos.vault.promoteFromInbox(inboxId, { title: opts.title });
        console.log(`Created note ${note.id} from inbox item ${inboxId}`);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });

  cmd
    .command("list")
    .description("List notes, newest first")
    .option("-s, --status <status>", 'filter by status: "active", "archived"')
    .option("--tag <tag>", "filter by tag")
    .action((opts) => {
      const ashos = new AshOS();
      const notes = ashos.vault.list({ status: opts.status as VaultStatus | undefined, tag: opts.tag });
      if (notes.length === 0) {
        console.log("Vault is empty. Create a note with `ash vault add <title> <content>`.");
        return;
      }
      for (const note of notes) {
        console.log(`[${note.status}] ${note.id}  ${note.title}`);
      }
    });

  cmd
    .command("show <id>")
    .description("Show full details for one note")
    .action((id: string) => {
      const ashos = new AshOS();
      const note = ashos.vault.get(id);
      if (!note) {
        console.error(`No vault note found with id "${id}".`);
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(note, null, 2));
    });

  cmd
    .command("archive <id>")
    .description("Mark a note as archived")
    .action(async (id: string) => {
      const ashos = new AshOS();
      try {
        const note = await ashos.vault.archive(id);
        console.log(`Archived ${note.id}`);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });

  cmd
    .command("link <id> <targetId>")
    .description("Link one note to another")
    .action(async (id: string, targetId: string) => {
      const ashos = new AshOS();
      try {
        await ashos.vault.link(id, targetId);
        console.log(`Linked ${id} -> ${targetId}`);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });

  cmd
    .command("backlinks <id>")
    .description("Show notes that link to this note")
    .action((id: string) => {
      const ashos = new AshOS();
      const notes = ashos.vault.backlinks(id);
      if (notes.length === 0) {
        console.log("No backlinks.");
        return;
      }
      for (const note of notes) console.log(`${note.id}  ${note.title}`);
    });
}
