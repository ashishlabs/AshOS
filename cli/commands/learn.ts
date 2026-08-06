import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";
import type { ReviewGrade } from "../../learning/srs";
import type { LearningResourceStatus, LearningResourceType } from "../../learning/types";

export function registerLearnCommand(program: Command): void {
  const cmd = program.command("learn").description("Learning Hub: tracked courses/books/videos/articles, plus spaced-repetition flashcards");

  const resource = cmd.command("resource").description("Courses, books, videos, and articles you're learning from");

  resource
    .command("add <title>")
    .description('Track a new resource — type is "course", "book", "video", or "article"')
    .requiredOption("-t, --type <type>", 'resource type: "course", "book", "video", "article"')
    .option("-u, --url <url>", "resource URL")
    .option("--tags <tags>", "comma-separated tags")
    .action(async (title: string, opts) => {
      const ashos = new AshOS();
      const tags = opts.tags ? String(opts.tags).split(",").map((t: string) => t.trim()).filter(Boolean) : undefined;
      const created = await ashos.learning.addResource(title, opts.type as LearningResourceType, { url: opts.url, tags });
      console.log(`Created resource ${created.id}`);
    });

  resource
    .command("list")
    .description("List tracked resources, newest first")
    .option("-s, --status <status>", 'filter by status: "to-learn", "in-progress", "completed"')
    .option("--type <type>", 'filter by type: "course", "book", "video", "article"')
    .action((opts) => {
      const ashos = new AshOS();
      const resources = ashos.learning.listResources({
        status: opts.status as LearningResourceStatus | undefined,
        type: opts.type as LearningResourceType | undefined
      });
      if (resources.length === 0) {
        console.log("No resources tracked yet. Add one with `ash learn resource add <title> --type <type>`.");
        return;
      }
      for (const r of resources) console.log(`[${r.status}] [${r.type}] ${r.id}  ${r.title}`);
    });

  resource
    .command("show <id>")
    .description("Show full details for one resource")
    .action((id: string) => {
      const ashos = new AshOS();
      const found = ashos.learning.getResource(id);
      if (!found) {
        console.error(`No resource found with id "${id}".`);
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(found, null, 2));
    });

  resource
    .command("status <id> <status>")
    .description('Update a resource\'s status: "to-learn", "in-progress", "completed"')
    .action(async (id: string, status: string) => {
      const ashos = new AshOS();
      try {
        const updated = await ashos.learning.updateResourceStatus(id, status as LearningResourceStatus);
        console.log(`Resource ${updated.id} is now [${updated.status}]`);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });

  const card = cmd.command("card").description("Flashcards reviewed via the SuperMemo-2 spaced repetition algorithm");

  card
    .command("add <front> <back>")
    .description("Add a flashcard, due for its first review immediately")
    .option("--tags <tags>", "comma-separated tags")
    .action(async (front: string, back: string, opts) => {
      const ashos = new AshOS();
      const tags = opts.tags ? String(opts.tags).split(",").map((t: string) => t.trim()).filter(Boolean) : undefined;
      const created = await ashos.learning.addCard(front, back, { tags });
      console.log(`Created flashcard ${created.id}`);
    });

  card
    .command("list")
    .description("List flashcards")
    .option("--due", "only show cards due for review now")
    .action((opts) => {
      const ashos = new AshOS();
      const cards = ashos.learning.listCards({ due: opts.due });
      if (cards.length === 0) {
        console.log(opts.due ? "No cards due for review." : "No flashcards yet.");
        return;
      }
      for (const c of cards) console.log(`${c.id}  ${c.front}  (due ${c.dueDate})`);
    });

  card
    .command("show <id>")
    .description("Show full details for one flashcard")
    .action((id: string) => {
      const ashos = new AshOS();
      const found = ashos.learning.getCard(id);
      if (!found) {
        console.error(`No flashcard found with id "${id}".`);
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(found, null, 2));
    });

  card
    .command("review <id> <grade>")
    .description('Review a card and schedule its next review: "again", "hard", "good", "easy"')
    .action(async (id: string, grade: string) => {
      const ashos = new AshOS();
      try {
        const reviewed = await ashos.learning.reviewCard(id, grade as ReviewGrade);
        console.log(`Reviewed ${reviewed.id} — next due ${reviewed.dueDate} (interval ${reviewed.interval}d)`);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });
}
