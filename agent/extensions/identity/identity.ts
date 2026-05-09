import type { BuildSystemPromptOptions, ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { formatSkillsForPrompt } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";

interface Identity {
   name: string;
   description: string;
   tools: string[];
   guidelinesOverride?: string[];
}

// * NOTE: guidelinesOverride completely replaces all prompt guidelines provided by tools and such when defined
// * leave undefined to keep default guidelines
const IDENTITIES: Record<string, Identity> = {
   jeeves: {
      name: "jeeves",
      description: "a focused assistant that answers questions by searching the web",
      tools: ["web-search", "web-scrape"],
      guidelinesOverride: [
         "Use web-search when the user wants up-to-date information about something.",
         "web-search only provides a list of page URLs and summaries: use web-scrape to get full content from results.",
      ],
   },
};

let currentIdentity: string | null = null;

export default function (pi: ExtensionAPI) {
   pi.registerCommand("id", {
      description: "Switch agent identity (overrides tools and system prompt)",
      getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
         const items = Object.keys(IDENTITIES).map((idName) => {
            const identity = IDENTITIES[idName];

            return { value: identity.name, label: identity.name, description: identity.description };
         });
         const filtered = items.filter((i) => i.value.startsWith(prefix));
         return filtered.length > 0 ? filtered : null;
      },
      handler: async (args, ctx) => {
         const identityName = args.trim();

         if (!identityName) {
            ctx.ui.notify("Usage: /id <identity>", "error");
            return;
         }

         if (!(identityName in IDENTITIES)) {
            const available = Object.keys(IDENTITIES).join(", ");
            ctx.ui.notify(`Unknown identity. Available: ${available}`, "error");
            return;
         }

         currentIdentity = identityName;
         updateStatus(ctx);
      },
   });

   function updateStatus(ctx: { ui: ExtensionUIContext }) {
      if (currentIdentity) {
         ctx.ui.setStatus("identity", ctx.ui.theme.fg("customMessageLabel", `[${currentIdentity}] mode`));
      } else {
         ctx.ui.setStatus("identity", undefined);
      }
   }

   function buildIdentitySystemPrompt(identityName: string, systemPromptOptions: BuildSystemPromptOptions): string {
      const identity = IDENTITIES[identityName];
      if (!identity) return "";

      const { selectedTools, toolSnippets, promptGuidelines, cwd, contextFiles, skills, appendSystemPrompt } =
         systemPromptOptions;

      // * NOTE: mostly copied from @earendil-works/pi-coding-agent/dist/core/system-prompt.js for consistency

      const promptCwd = cwd.replace(/\\/g, "/");
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const date = `${year}-${month}-${day}`;
      const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";

      // Build tools list based on identity tools
      const tools = identity.tools || selectedTools || ["read", "bash", "edit", "write"];
      const toolSnippetsObj = toolSnippets ?? {};
      const visibleTools = tools.filter((name) => !!toolSnippetsObj[name]);
      const toolsList =
         visibleTools.length > 0
            ? visibleTools.map((name) => `- ${name}: ${toolSnippetsObj[name]}`).join("\n")
            : "(none)";

      // Build guidelines
      const guidelinesList: string[] = [];
      const guidelinesSet = new Set();
      const addGuideline = (guideline: string) => {
         if (guidelinesSet.has(guideline)) return;
         guidelinesSet.add(guideline);
         guidelinesList.push(guideline);
      };

      const hasBash = tools.includes("bash");
      const hasGrep = tools.includes("grep");
      const hasFind = tools.includes("find");
      const hasLs = tools.includes("ls");
      const hasRead = tools.includes("read");

      if (hasBash && !hasGrep && !hasFind && !hasLs) {
         addGuideline("Use bash for file operations like ls, rg, find");
      } else if (hasBash && (hasGrep || hasFind || hasLs)) {
         addGuideline("Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)");
      }

      for (const guideline of promptGuidelines ?? []) {
         const normalized = guideline.trim();
         if (normalized.length > 0) {
            addGuideline(normalized);
         }
      }

      addGuideline("Show file paths clearly when working with files");

      if (identity.guidelinesOverride !== undefined) {
         guidelinesSet.clear();
         guidelinesList.length = 0;
         identity.guidelinesOverride.forEach((guideline) => {
            addGuideline(guideline);
         });
      }

      // keep this one from default system prompt even with override because clankers love yapping
      addGuideline("Be concise in your responses");

      const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

      // Build the system prompt for the identity
      // Start with identity-specific intro, then copy the default structure but remove pi-specific parts
      let prompt = `You are ${identity.description}, operating inside pi, a coding agent harness.

Available tools:
${toolsList}

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
${guidelines}`;

      if (appendSection) {
         prompt += appendSection;
      }

      // Append project context files
      const contextFilesList = contextFiles ?? [];
      if (contextFilesList.length > 0) {
         prompt += "\n\n# Project Context\n\n";
         prompt += "Project-specific instructions and guidelines:\n\n";
         for (const { path: filePath, content } of contextFilesList) {
            prompt += `## ${filePath}\n\n${content}\n\n`;
         }
      }

      // Append skills section (only if read tool is available)
      const skillsList = skills ?? [];
      if (hasRead && skillsList.length > 0) {
         prompt += formatSkillsForPrompt(skillsList);
      }

      // Add date and working directory last
      prompt += `\nCurrent date: ${date}`;
      prompt += `\nCurrent working directory: ${promptCwd}`;

      return prompt;
   }

   pi.on("before_agent_start", (event, _ctx) => {
      if (!currentIdentity) return;

      const identity = IDENTITIES[currentIdentity];
      if (!identity) return;

      // Set active tools for this identity
      pi.setActiveTools(identity.tools);

      // Override system prompt
      const newSystemPrompt = buildIdentitySystemPrompt(currentIdentity, event.systemPromptOptions);

      return {
         systemPrompt: newSystemPrompt,
      };
   });

   // Initialize status on session start
   pi.on("session_start", (_event, ctx) => {
      updateStatus(ctx);
   });
}
