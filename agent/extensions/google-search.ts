import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Markdown } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

const USE_NERD_FONT = true; // * NOTE: toggle this off if your font doesn't support Nerd Font icons

async function executeGoogleSearch(query: string, ctx: any) {
   // ~/.pi/agent/auth.json
   const zyteKey = await ctx.modelRegistry.authStorage.getApiKey("zyte");

   if (!zyteKey) {
      throw new Error("Zyte API key not found in auth storage");
   }

   const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
   const response = await fetch("https://api.zyte.com/v1/extract", {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
         Authorization: `Basic ${Buffer.from(`${zyteKey}:`).toString("base64")}`,
      },
      body: JSON.stringify({
         url: searchUrl,
         serp: true,
         serpOptions: { extractFrom: "httpResponseBody" },
      }),
   });

   if (!response.ok) {
      let errorMessage = `Zyte API request failed with status ${response.status}`;
      
      try {
        // should have a json response with 'title' https://docs.zyte.com/zyte-api/usage/reference.html
         const errorData: any = await response.json();
         if (!errorData.title) throw new Error();

            errorMessage = errorData.title;
      } catch (_e) {
      }
      
      throw new Error(errorMessage);
   }

   const responseData: any = await response.json();

   if (!responseData.serp || !responseData.serp.organicResults || responseData.serp.organicResults.length === 0) {
      throw new Error("No search results found.");
   }

   const sortedResults = [...responseData.serp.organicResults].sort((a, b) => a.rank - b.rank);
   let markdown = `# Search Results for "${query}"\n\n`;

   for (const result of sortedResults) {
      markdown += `[${result.name}](${result.url})\n`;
      markdown += `${result.description || "No description available."}\n\n`;
   }

   return markdown;
}

export default function (pi: ExtensionAPI) {
   pi.registerTool({
      name: "google-search",
      label: "Google web search",
      description: "Search Google for a list of results that you can then read using the web-scrape tool",
      promptGuidelines: [
         "Use google-search when the user wants up-to-date information about something.",
         "google-search only provides a list of page URLs and summaries: use web-scrape to get full content from results.",
      ],
      parameters: Type.Object({
         query: Type.String({
            description: "Search query",
         }),
      }),
      async execute(_toolCallId, params, _signal, onUpdate, ctx) {
         try {
            onUpdate?.({
               content: [
                  {
                     type: "text",
                     text: `${USE_NERD_FONT ? "\udb81\udf0f " : ""}Searching the web for: "${params.query}"`,
                  },
               ],
               details: { query: params.query },
            });

            const resultText = await executeGoogleSearch(params.query, ctx);

            return {
               content: [{ type: "text", text: resultText }],
               details: { markdownContent: resultText },
            };
         } catch (error) {
            console.error("Web search error:", error);
            return {
               content: [
                  {
                     type: "text",
                     text: `Web search failed: ${error instanceof Error ? error.message : String(error)}`,
                  },
               ],
               details: { markdownContent: "" },
               isError: true,
            };
         }
      },
      renderResult(result, _options, _theme, _context) {
         const markdownTheme = getMarkdownTheme();

         const markdownText =
            result.details && typeof result.details === "object" && "markdownContent" in result.details
               ? String((result.details as { markdownContent?: unknown }).markdownContent ?? "")
               : "";

         if (markdownText.trim()) {
            return new Markdown(markdownText, 1, 1, markdownTheme);
         }

         const fallback = result.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n\n");

         return new Markdown(fallback || "(no content)", 1, 1, markdownTheme);
      },
   });

   // Register slash command
   pi.registerCommand("google", {
      description: "Search Google",
      handler: async (args, ctx) => {
         if (!args || args.trim() === "") {
            ctx.ui.notify("Usage: /google <search query>", "error");
            return;
         }

         const query = args.trim();

         // show loading status in footer with theme styling
         const theme = ctx.ui.theme;
         ctx.ui.setStatus(
            "google-search",
            theme.fg("muted", `${USE_NERD_FONT ? "\udb81\udf0f " : ""}Searching the web for: "${query}"...`),
         );

         try {
            const toolResult = await executeGoogleSearch(query, ctx);

            // clear loading status
            ctx.ui.setStatus("google-search", undefined);

            pi.sendMessage({
               customType: "google-search-result",
               content: toolResult,
               display: true,
               details: { query, source: "slash-command" },
            });
         } catch (error) {
            ctx.ui.setStatus("google-search", undefined);
            ctx.ui.notify(`Google search failed: ${error instanceof Error ? error.message : String(error)}`, "error");
         }
      },
   });
}
