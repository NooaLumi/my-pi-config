import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const DANGEROUS_PATTERNS: { label: string; pattern: RegExp }[] = [
   { label: "rm -rf", pattern: /\brm\s+(-rf|--recursive|-r\s+-f|-f\s+-r)\b/i },
   { label: "sudo", pattern: /^\s*sudo\b/i },
   { label: "git push", pattern: /\bgit\s+push\b/i },
];

export default function (pi: ExtensionAPI) {
   pi.on("tool_call", async (event, ctx) => {
      if (event.toolName !== "bash") return undefined;

      const command = event.input.command as string;
      const matched = DANGEROUS_PATTERNS.find(({ pattern }) => pattern.test(command));
      if (!matched) return undefined;

      if (!ctx.hasUI) {
         return {
            block: true,
            reason: `${matched.label} command blocked (no UI for confirmation)`,
         };
      }

      const choice = await ctx.ui.select(
         `${matched.label} command needs user approval:

  ${command}

Allow execution?`,
         ["Yes", "No"],
      );

      if (choice !== "Yes") {
         return { block: true, reason: "Blocked by user" };
      }

      return undefined;
   });
}
