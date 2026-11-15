import { tmpdir } from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

const TMP_ROOTS = [tmpdir(), "/tmp", "/var/tmp"].map((r) => path.resolve(r));
const DELETE_CMDS = new Set(["rm", "rmdir", "unlink"]);
const INSTALLERS = new Set(["apt", "apt-get", "apk"]); // system-wide package managers
const INSTALL_WORDS = new Set(["install", "add"]);
const GIT_DANGEROUS = new Set(["commit", "push", "rm", "clean", "reset", "checkout", "restore"]);

const stripQuotes = (w: string) => w.replace(/^["']|["']$/g, "");

function isInTmp(p: string, cwd: string, relativeOk: boolean): boolean {
   p = stripQuotes(p);
   if (relativeOk && !path.isAbsolute(p)) return true; // we cd'd into /tmp
   const resolved = path.resolve(cwd, p);
   return TMP_ROOTS.some((root) => resolved === root || resolved.startsWith(root + path.sep));
}

// Returns a reason if the command looks like it removes something (outside
// /tmp), installs a system package, or commits/pushes git changes.
// Not adversarial-proof, just meant to catch accidents.
export function findDanger(command: string, cwd: string): string | null {
   let inTmpDir = false;
   for (const part of command.split(/[;&|()\n`]+/)) {
      const words = part.trim().split(/\s+/).filter(Boolean);
      while (words.length > 0 && (words[0] === "sudo" || /^\w+=/.test(words[0]))) words.shift();
      if (words.length === 0) continue;

      const cmd = path.posix.basename(words[0]);
      const args = words.slice(1).map(stripQuotes);

      if (cmd === "cd") {
         if (args[0] && isInTmp(args[0], cwd, false)) inTmpDir = true;
         continue;
      }
      if (DELETE_CMDS.has(cmd)) {
         const outside = args.filter((a) => !a.startsWith("-") && !isInTmp(a, cwd, inTmpDir));
         if (outside.length > 0) return `${cmd} ${outside.join(" ")}`;
      } else if (cmd === "git") {
         const sub = args.find((a, i) => !a.startsWith("-") && !["-C", "-c"].includes(args[i - 1] ?? ""));
         if (sub && GIT_DANGEROUS.has(sub)) return `git ${sub}`;
      } else if (INSTALLERS.has(cmd)) {
         const word = args.slice(0, 2).find((a) => INSTALL_WORDS.has(a));
         if (word) return `${cmd} ${word}`;
      }
   }
   return null;
}

export default function (pi: ExtensionAPI) {
   pi.on("tool_call", async (event, ctx) => {
      if (!isToolCallEventType("bash", event)) return;

      const command = event.input.command;
      const reason = findDanger(command, ctx.cwd);
      if (!reason) return;

      if (!ctx.hasUI) {
         return {
            block: true,
            reason: `Command blocked (no UI for confirmation): ${reason}`,
         };
      }

      const choice = await ctx.ui.select(
         `${ctx.ui.theme.fg("muted", `Clanker wants to run:`)}\n${ctx.ui.theme.fg("accent", command)}\n${ctx.ui.theme.fg("error", `Guard: ${reason}`)}\n${ctx.ui.theme.fg("muted", "We good?")}`,
         ["Yes", "No"],
      );
      if (choice === "Yes") return;
      if (choice === undefined) return { block: true, reason: "Blocked by user" };

      // "No": let the user tell the agent what to do instead; their text is
      // returned as the block reason, so the agent sees it as the tool result
      const instead = await ctx.ui.input("Blocked. What should it do instead?");
      return {
         block: true,
         reason: instead ? `Blocked by user. User said: ${instead}` : `Blocked by user (${reason})`,
      };
   });
}
