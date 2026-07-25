import { Command } from "commander";
import readline from "node:readline";
import { AshOS } from "../../sdk/ashos";
import type { ChatMessage } from "../../providers/types";

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description("Interactive chat session with the active provider")
    .action(async () => {
      const ashos = new AshOS();
      const history: ChatMessage[] = [];
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "you> " });

      console.log(`Chatting with provider "${ashos.providers.active().name()}". Type "exit" to quit.`);
      rl.prompt();

      rl.on("line", async (line) => {
        const text = line.trim();
        if (text === "exit" || text === "quit") {
          rl.close();
          return;
        }
        history.push({ role: "user", content: text });
        const result = await ashos.chat(history);
        history.push({ role: "assistant", content: result.content });
        console.log(`ash> ${result.content}`);
        rl.prompt();
      });
    });
}
