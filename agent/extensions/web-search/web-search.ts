import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { getIcon, Icon, withEllipsisAnimation } from "../util.js";

const SEARCH_TIMEOUT_MS = 30000;

async function executeGoogleSearch(query: string, ctx: any): Promise<string> {
   const sanitizedQuery = query.trim();
   if (!sanitizedQuery) {
      throw new Error("Search query cannot be empty");
   }

   const zyteKey = await ctx.modelRegistry.authStorage.getApiKey("zyte");

   if (!zyteKey) {
      throw new Error('Zyte API key not found. Add it to ~/.pi/agent/auth.json with key: "zyte"');
   }

   const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(sanitizedQuery)}`;

   const controller = new AbortController();
   const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

   try {
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
         signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
         let errorMessage = `Zyte API request failed with status ${response.status}`;
         try {
            const errorData = await response.json();
            if (errorData && typeof errorData === "object") {
               errorMessage = (errorData as { title?: string }).title || errorMessage;
            }
         } catch {}
         throw new Error(errorMessage);
      }

      const responseData: unknown = await response.json();

      if (!responseData || typeof responseData !== "object") {
         throw new Error("Invalid response format from Zyte API");
      }

      const serp = (responseData as { serp?: unknown }).serp;
      if (!serp || typeof serp !== "object") {
         throw new Error("No SERP data in response");
      }

      const organicResults = (serp as { organicResults?: unknown }).organicResults;
      if (!Array.isArray(organicResults) || organicResults.length === 0) {
         throw new Error("No search results found.");
      }

      const results = organicResults as Array<{ name: string; url: string; description?: string; rank: number }>;
      const sortedResults = [...results].sort((a, b) => a.rank - b.rank);

      const icon = getIcon(Icon.Search);
      let markdown = `${icon}# Search Results for "${sanitizedQuery}"`;
      markdown += `\n\n*Found ${sortedResults.length} result${sortedResults.length !== 1 ? "s" : ""}*\n\n`;

      for (const result of sortedResults) {
         const displayUrl = result.url.replace(/^https?:\/\//, "");
         markdown += `### [${result.name}](${result.url})\n`;
         markdown += `${displayUrl}\n\n`;
         markdown += `${result.description || "No description available."}\n\n`;
         markdown += "---\n\n";
      }

      return markdown;
   } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
         throw new Error(`Search timed out after ${SEARCH_TIMEOUT_MS / 1000} seconds`);
      }
      throw error;
   }
}

export default function (pi: ExtensionAPI) {
   pi.registerTool({
      name: "web-search",
      label: "Web search",
      promptSnippet: "Search the web using Google for a list of results",
      description: "Search the web using Google for a list of results",
      promptGuidelines: [
         "Use web-search when the user wants up-to-date information about something.",
         "web-search only provides a list of page URLs and summaries: use web-scrape to get full content from results.",
      ],
      parameters: Type.Object({
         query: Type.String({
            description: "Search query",
         }),
      }),
      async execute(_toolCallId, params, _signal, onUpdate, ctx) {
         const query = params.query;

         try {
            onUpdate?.({
               content: [
                  {
                     type: "text",
                     text: `${getIcon(Icon.Search)}Searching the web for: "${query}"`,
                  },
               ],
               details: { query },
            });

            const resultText = await executeGoogleSearch(query, ctx);

            return {
               content: [{ type: "text", text: resultText }],
               details: { markdownContent: resultText, query },
            };
         } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("Web search error:", error);

            return {
               content: [
                  {
                     type: "text",
                     text: `Web search failed: ${errorMessage}`,
                  },
               ],
               details: { markdownContent: "", query },
               isError: true,
            };
         }
      },
      renderResult(result, _options, _theme, _context) {
         const markdownTheme = getMarkdownTheme();

         const details = result.details as { markdownContent?: string } | undefined;
         const markdownText = details?.markdownContent ?? "";

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
         const theme = ctx.ui.theme;
         const icon = getIcon(Icon.Search);

         const clearEllipsis = withEllipsisAnimation((ellipsis: string) => {
            ctx.ui.setStatus("google-search", theme.fg("muted", `${icon}Searching the web for: "${query}"${ellipsis}`));
         });

         try {
            const toolResult = await executeGoogleSearch(query, ctx);

            clearEllipsis();
            ctx.ui.setStatus("google-search", undefined);

            pi.sendMessage({
               customType: "google-search-result",
               content: toolResult,
               display: true,
               details: { query, source: "slash-command" },
            });
         } catch (error) {
            clearEllipsis();
            ctx.ui.setStatus("google-search", undefined);
            const errorMessage = error instanceof Error ? error.message : String(error);
            ctx.ui.notify(`Google search failed: ${errorMessage}`, "error");
         }
      },
   });
}
