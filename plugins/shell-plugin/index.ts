import type { Plugin } from "../../kernel/types";
import { ShellTool } from "../../tools/shell-tool";
import { TestingAgent } from "../../agents/testing-agent";
import manifest from "./manifest.json";

export const plugin: Plugin = {
  manifest,
  register(host) {
    host.tools.register(new ShellTool(host.kernel.permissions));
    host.agents.register(new TestingAgent());
  }
};

export default plugin;
