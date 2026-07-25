import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check environment health: tools, provider connectivity, config")
    .action(async () => {
      const ashos = new AshOS();
      console.log(`Provider: ${ashos.providers.active().name()}`);

      const health = await ashos.tools.healthCheckAll();
      for (const [name, result] of Object.entries(health)) {
        console.log(`${result.healthy ? "✔" : "✘"} tool:${name}${result.detail ? ` — ${result.detail}` : ""}`);
      }

      try {
        await ashos.chat([{ role: "user", content: "ping" }]);
        console.log(`✔ provider:${ashos.providers.active().name()} reachable`);
      } catch (error) {
        console.log(`✘ provider:${ashos.providers.active().name()} unreachable — ${(error as Error).message}`);
      }
    });
}
