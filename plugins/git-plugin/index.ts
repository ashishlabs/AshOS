import type { Plugin } from "../../kernel/types";
import { GitTool } from "../../tools/git-tool";
import { GitAgent } from "../../agents/git-agent";
import manifest from "./manifest.json";

/**
 * Reference plugin: contributes the git tool + git agent. Demonstrates the
 * minimal shape a plugin needs — see docs/plugin-development.md.
 */
export const plugin: Plugin = {
  manifest,
  register(host) {
    host.tools.register(new GitTool(host.kernel.permissions));
    host.agents.register(new GitAgent());
  }
};

export default plugin;
