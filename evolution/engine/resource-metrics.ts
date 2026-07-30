import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ResourceMetrics {
  memoryUsageMb: number;
  gpuUtilizationPercent?: number;
}

/**
 * Best-effort GPU utilization via `nvidia-smi`. Returns undefined instead
 * of throwing when it's unavailable — no GPU, no NVIDIA driver, or not on
 * PATH (e.g. this runs fine on a GPU-less CI box, and just omits the
 * field). Never assume it's there.
 */
export async function collectGpuUtilization(): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync("nvidia-smi", ["--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"], {
      timeout: 5000
    });
    const value = parseFloat(stdout.trim().split("\n")[0]);
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Resident set size of the current (orchestrator) process, in MB. */
export function collectProcessMemoryMb(): number {
  return Math.round(process.memoryUsage().rss / (1024 * 1024));
}

export async function collectResourceMetrics(): Promise<ResourceMetrics> {
  return {
    memoryUsageMb: collectProcessMemoryMb(),
    gpuUtilizationPercent: await collectGpuUtilization()
  };
}
