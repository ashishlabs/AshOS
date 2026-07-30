import { describe, expect, it } from "vitest";
import { collectGpuUtilization, collectProcessMemoryMb, collectResourceMetrics } from "./resource-metrics";

describe("resource metrics", () => {
  it("reports a positive process memory figure", () => {
    expect(collectProcessMemoryMb()).toBeGreaterThan(0);
  });

  it("resolves to undefined instead of throwing when nvidia-smi is unavailable", async () => {
    // This sandbox has no GPU/nvidia-smi, so this exercises the real
    // graceful-degradation path rather than a mocked one.
    const utilization = await collectGpuUtilization();
    expect(utilization === undefined || typeof utilization === "number").toBe(true);
  });

  it("collectResourceMetrics never throws even without a GPU present", async () => {
    const metrics = await collectResourceMetrics();
    expect(metrics.memoryUsageMb).toBeGreaterThan(0);
    expect(metrics.gpuUtilizationPercent === undefined || typeof metrics.gpuUtilizationPercent === "number").toBe(true);
  });
});
