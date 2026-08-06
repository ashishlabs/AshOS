#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { registerInitCommand } from "./commands/init";
import { registerDoctorCommand } from "./commands/doctor";
import { registerStatusCommand } from "./commands/status";
import { registerProviderCommand } from "./commands/provider";
import { registerPluginCommand } from "./commands/plugin";
import { registerPlanCommand } from "./commands/plan";
import { registerRunCommand } from "./commands/run";
import { registerChatCommand } from "./commands/chat";
import { registerMemoryCommand } from "./commands/memory";
import { registerLogsCommand } from "./commands/logs";
import { registerInnovationCommand } from "./commands/innovation";
import { registerCodebaseCommand } from "./commands/codebase";
import { registerGraphCommand } from "./commands/graph";
import { registerInboxCommand } from "./commands/inbox";
import { registerVaultCommand } from "./commands/vault";
import { registerReflectCommand } from "./commands/reflect";
import { registerSearchCommand } from "./commands/search";

const program = new Command();
program.name("ash").description("AshOS — AI Operating System for Developers").version("0.1.0");

registerInitCommand(program);
registerDoctorCommand(program);
registerStatusCommand(program);
registerProviderCommand(program);
registerPluginCommand(program);
registerPlanCommand(program);
registerRunCommand(program);
registerChatCommand(program);
registerMemoryCommand(program);
registerLogsCommand(program);
registerInnovationCommand(program);
registerCodebaseCommand(program);
registerGraphCommand(program);
registerInboxCommand(program);
registerVaultCommand(program);
registerReflectCommand(program);
registerSearchCommand(program);

program.parseAsync(process.argv);
