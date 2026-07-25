export interface ToolCapabilities {
  name: string;
  description: string;
  actions: string[];
}

export interface ToolRequirements {
  /** binaries that must be on PATH, e.g. ["git"] */
  binaries?: string[];
  /** environment variables that must be set */
  env?: string[];
}

export interface ToolHealth {
  healthy: boolean;
  detail?: string;
}

export interface ToolExecuteRequest {
  action: string;
  args?: Record<string, unknown>;
}

export interface ToolExecuteResult {
  ok: boolean;
  output?: string;
  error?: string;
}

/**
 * Uniform contract for anything AshOS can shell out to or call locally
 * (git, docker, ffmpeg, playwright, ...). Tools declare what they need and
 * what they can do so the PluginManager/AgentRouter can discover them.
 */
export interface Tool {
  capabilities(): ToolCapabilities;
  requirements(): ToolRequirements;
  permissions(): { dangerous: boolean };
  healthCheck(): Promise<ToolHealth>;
  execute(request: ToolExecuteRequest): Promise<ToolExecuteResult>;
}
