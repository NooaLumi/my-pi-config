import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { parse as shellParse } from "shell-quote";

function isDangerousCommand(command: string): boolean {
   let tokens = [];
   try {
      tokens = shellParse(command);
   } catch {
      return true; // can't parse -> fuck off.
   }

   // get control operators
   const ops = tokens.filter((t) => typeof t === "object" && t !== null && "op" in t).map((t) => t.op);

   // shell output redirection can overwrite files
   // ignore >/dev/null 
   if (ops.some((op) => op === ">")) {
      const hasDangerousRedirection = tokens.some((token, i, arr) => {
         if (typeof token !== "object" || token === null || !("op" in token) || (token.op !== ">")) return false;

         const nextToken = arr[i + 1];
         return typeof nextToken === "string" && nextToken === "/dev/null";
      });
      
      if (hasDangerousRedirection) return true;
   }

   // get non-control operators
   const cmds = tokens.filter((t) => typeof t === "string");

   for (const cmd of cmds) {
      const nogo = ["sudo", "rm", "rmdir", "unlink", "chmod", "chown", "eval", "source"];
      if (nogo.includes(cmd)) return true;

      // git commands
      if (cmd === "git") {
         const gitnogo = ["rm", "clean", "reset", "checkout", "restore", "push", "reflog", "gc", "rebase", "merge"];
         if (gitnogo.some((danger) => cmds.includes(danger))) return true;
      }

      // find -delete
      if (cmd === "find" && cmds.includes("-delete")) return true;

      // overwriting mv/cp
      if (cmd === "mv" && (cmds.includes("-f") || cmds.includes("--force"))) return true;
      if (cmd === "cp" && (cmds.includes("-f") || cmds.includes("--force"))) return true;
   }

   return false;
}

export default function (pi: ExtensionAPI) {
   pi.on("tool_call", async (event, ctx) => {
      if (!isToolCallEventType("bash", event)) return;

      const command = event.input.command;
      const matched = isDangerousCommand(command);
      if (!matched) return;

      if (!ctx.hasUI) {
         return {
            block: true,
            reason: `Command blocked (no UI for confirmation)`,
         };
      }

      const choice = await ctx.ui.select(
         `${ctx.ui.theme.fg("muted", `Clanker wants to run:`)}\n${ctx.ui.theme.fg("accent", command)}\n${ctx.ui.theme.fg("muted", "We good?")}`,
         ["Yes", "No"],
      );

      if (choice === "Yes") return;

      return { block: true, reason: "Blocked by user" };
   });
}
