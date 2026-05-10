import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DefaultResourceLoader, getAgentDir, VERSION } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
   let skills: { name: string; path: string }[] = [];
   let prompts: { name: string; path: string }[] = [];
   let extensions: { name: string; path: string }[] = [];
   let contextFiles: { path: string }[] = [];

   pi.on("session_start", async (_event, ctx) => {
      try {
         const loader = new DefaultResourceLoader({
            cwd: ctx.cwd,
            agentDir: getAgentDir(),
         });
         await loader.reload();

         skills = loader.getSkills().skills.map((skill) => ({
            name: skill.name,
            path: skill.filePath,
         }));

         prompts = loader.getPrompts().prompts.map((prompt) => ({
            name: prompt.name,
            path: prompt.filePath,
         }));

         extensions = loader.getExtensions().extensions.map((ext) => {
            // extract filename from path and remove .ts extension
            const pathParts = ext.path.split("/");
            const filename = pathParts[pathParts.length - 1];
            const name = filename.replace(".ts", "");
            return {
               name: name,
               path: ext.resolvedPath,
            };
         });

         contextFiles = loader.getAgentsFiles().agentsFiles.map((file) => ({
            path: file.path,
         }));
      } catch (error) {
         console.error("Failed to load resource information:", error);
      }

      // only show in interactive mode
      if (!ctx.hasUI) return;

      ctx.ui.setHeader((_tui, theme) => {
         return {
            render(_width: number): string[] {
               // https://patorjk.com/software/taag - Colossal (modified)
               const asciiArtRows = [
                  ` .d8888b.  888        d88888b    8888   d888888888888888888b. `,
                  `d88P  Y88b 888       d8888888b   8888  d88P 888     888   Y88b`,
                  `888    Y88 888      d88P888888b  8888 d88P  888     888    888`,
                  `888       d888     d88P 888 Y88b 8888dd8K   8888888 888   d88P`,
                  `888      d8888    d88P  888  Y88b8888888b   888     8888888P" `,
                  `888     d8P888   d88P   888   Y88888  Y88b  888     888 T88b  `,
                  `Y88b  d88P 888  d8888888888    Y8888   Y88b 888     888  Y88b `,
                  ` "Y8888P"  888888888P   888     Y888    Y88b8888888P888   "88b`,
               ];

               const getOnboardingLines = (): string[] => {
                  // todo cleanup
                  const lines = asciiArtRows.map((row, i) => theme.fg(i > 5 ? "customMessageLabel" : "border", row));
                  lines[0] += theme.fg("border", `Try again`);
                  lines[1] += theme.fg("border", ` toaster...`);
                  lines[2] += theme.fg("customMessageLabel", `  v${VERSION}`);
                  lines[3] += theme.fg("customMessageLabel", ` o`);
                  lines[4] += theme.fg("customMessageLabel", `o`);
                  lines[5] += theme.fg("customMessageLabel", `o`);
                  lines[6] += theme.fg("border", ` o`);
                  lines[7] += theme.fg("border", `  o`);

                  lines.push(" ".repeat(63) + theme.fg("border", "o"));
                  return lines;
               };

               const resourceLines = [];

               // Skills
               if (skills.length > 0) {
                  resourceLines.push(theme.fg("muted", `Skills \uf061 ${skills.length}`));
                  resourceLines.push(
                     (skills.length > 0 ? "  " : "") + theme.fg("dim", skills.map((skill) => skill.name).join(", ")),
                  );
               }

               // Prompts
               if (prompts.length > 0) {
                  resourceLines.push(theme.fg("muted", `Prompts \uf061 ${prompts.length}`));
                  resourceLines.push(
                     (prompts.length > 0 ? "  " : "") +
                        theme.fg("dim", prompts.map((prompt) => prompt.path).join(", ")),
                  );
               }

               // Extensions
               if (extensions.length > 0) {
                  resourceLines.push(theme.fg("muted", `Extensions \uf061 ${extensions.length}`));
                  resourceLines.push(
                     (extensions.length > 0 ? "  " : "") +
                        theme.fg("dim", extensions.map((ext) => ext.name).join(", ")),
                  );
               }

               // Context files
               if (contextFiles.length > 0) {
                  resourceLines.push(theme.fg("muted", `Context files \uf061 ${contextFiles.length}`));
                  resourceLines.push(
                     (contextFiles.length > 0 ? "  " : "") +
                        theme.fg("dim", contextFiles.map((file) => file.path).join("\n  ")),
                  );
               }

               const contextInfo = resourceLines.length > 0 ? resourceLines : [theme.fg("dim", "No context? :(")];

               return [...getOnboardingLines(), ...contextInfo];
            },
            invalidate() {},
         };
      });
   });
}
