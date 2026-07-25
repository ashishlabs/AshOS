import fs from "node:fs";
import path from "node:path";
import type { EventBus } from "./event-bus";
import type { Plugin, PluginHost } from "./types";

/**
 * Loads and registers plugins. A plugin is any directory with a
 * `manifest.json` plus a module exporting a `Plugin` (see kernel/types.ts).
 * Everything in AshOS beyond the kernel primitives is meant to ship this way
 * so features can be added/removed without touching core code.
 */
export class PluginManager {
  private loaded = new Map<string, Plugin>();

  constructor(private eventBus?: EventBus) {}

  list(): Plugin[] {
    return [...this.loaded.values()];
  }

  get(name: string): Plugin | undefined {
    return this.loaded.get(name);
  }

  async register(plugin: Plugin, host: PluginHost): Promise<void> {
    if (this.loaded.has(plugin.manifest.name)) return;
    await plugin.register(host);
    this.loaded.set(plugin.manifest.name, plugin);
    this.eventBus?.emit("plugin:loaded", { name: plugin.manifest.name, version: plugin.manifest.version });
  }

  /**
   * Discovers plugins under a directory (default: <cwd>/plugins). Each
   * subdirectory must contain manifest.json and an index (.ts/.js) that
   * default-exports (or exports `plugin`) a Plugin object.
   */
  async loadFromDirectory(dir: string, host: PluginHost): Promise<string[]> {
    if (!fs.existsSync(dir)) return [];
    const registered: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());

    for (const entry of entries) {
      const pluginDir = path.join(dir, entry.name);
      const manifestPath = path.join(pluginDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) continue;

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      const indexCandidates = ["index.ts", "index.js"].map((f) => path.join(pluginDir, f));
      const indexPath = indexCandidates.find((p) => fs.existsSync(p));
      if (!indexPath) continue;

      const mod = await import(indexPath);
      const plugin: Plugin = mod.plugin ?? mod.default ?? mod;
      plugin.manifest = plugin.manifest ?? manifest;

      await this.register(plugin, host);
      registered.push(plugin.manifest.name);
    }
    return registered;
  }
}
