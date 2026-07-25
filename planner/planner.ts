import { randomUUID } from "node:crypto";
import type { AIProvider } from "../providers/types";
import type { PlannedTask, TaskGraph } from "./types";

const SYSTEM_PROMPT = `You are the planner inside AshOS, an AI operating system for developers.
Decompose the user's goal into a dependency graph of concrete tasks.
Respond with ONLY valid JSON matching this shape, no prose, no markdown fences:
{
  "tasks": [
    { "id": "string-slug", "title": "short title", "description": "what to do", "capability": "research|code|test|git|generic", "dependsOn": ["id", ...] }
  ]
}
Keep the graph small (3-10 tasks). Use dependsOn only for real ordering constraints so independent tasks can run in parallel.`;

function slugify(text: string, index: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || `task-${index}`;
}

/**
 * Turns a natural-language goal into a TaskGraph using the active
 * AIProvider. Falls back to a minimal single-task graph if the provider
 * doesn't return parseable JSON, so planning never hard-fails.
 */
export class Planner {
  constructor(private provider: AIProvider) {}

  async plan(goal: string): Promise<TaskGraph> {
    let raw: string;
    try {
      const { content } = await this.provider.chat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: goal }
        ],
        { temperature: 0.2 }
      );
      raw = content;
    } catch {
      return this.fallback(goal);
    }

    const tasks = this.parse(raw);
    if (!tasks || tasks.length === 0) return this.fallback(goal);
    return { goal, tasks };
  }

  private parse(raw: string): PlannedTask[] | undefined {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return undefined;
    try {
      const data = JSON.parse(jsonMatch[0]) as { tasks: Partial<PlannedTask>[] };
      return data.tasks.map((t, i) => ({
        id: t.id ?? slugify(t.title ?? `task-${i}`, i),
        title: t.title ?? `Task ${i + 1}`,
        description: t.description ?? t.title ?? "",
        capability: t.capability ?? "generic",
        dependsOn: t.dependsOn ?? []
      }));
    } catch {
      return undefined;
    }
  }

  private fallback(goal: string): TaskGraph {
    return {
      goal,
      tasks: [
        {
          id: randomUUID(),
          title: "Execute goal directly",
          description: goal,
          capability: "generic",
          dependsOn: []
        }
      ]
    };
  }
}
