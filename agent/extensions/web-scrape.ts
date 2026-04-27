import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Markdown } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

const USE_NERD_FONT = true; // * NOTE: toggle this off if your font doesn't support Nerd Font icons

async function executeScrape(url: string, ctx: any) {
   // ~/.pi/agent/auth.json
   const zyteKey = await ctx.modelRegistry.authStorage.getApiKey("zyte");

   if (!zyteKey) {
      throw new Error("Zyte API key not found in auth storage");
   }

   const response = await fetch("https://api.zyte.com/v1/extract", {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
         Authorization: `Basic ${Buffer.from(`${zyteKey}:`).toString("base64")}`,
      },
      body: JSON.stringify({
         url: url,
         pageContent: true,
         serpOptions: { extractFrom: "browserHtml" },
      }),
   });

   if (!response.ok) {
      let errorMessage = `Zyte API request failed with status ${response.status}`;

      try {
         // should have a json response with 'title' https://docs.zyte.com/zyte-api/usage/reference.html
         const errorData: any = await response.json();
         if (!errorData.title) throw new Error();

         errorMessage = errorData.title;
      } catch (_e) {}

      throw new Error(errorMessage);
   }

   const responseData: any = await response.json();

   if (!responseData.pageContent || !responseData.pageContent.itemMain) {
      throw new Error("Page not found or content couldn't be parsed.");
   }

   const markdown =
      `Page content from "${url}:"\n\n` +
      `# ${responseData.pageContent.headline || responseData.pageContent.title}\n` +
      `${responseData.pageContent.itemMain}`;

   return markdown;
}

export default function (pi: ExtensionAPI) {
   pi.registerTool({
      name: "web-scrape",
      label: "Web scrape",
      description: "Get the page contents of a URL/link",
      promptGuidelines: ["Use web-scrape to get the full web page content from a URL."],
      parameters: Type.Object({
         url: Type.String({
            description: "URL to scrape",
         }),
      }),
      async execute(_toolCallId, params, _signal, onUpdate, ctx) {
         try {
            onUpdate?.({
               content: [
                  {
                     type: "text",
                     text: `${USE_NERD_FONT ? "\udb81\udf0f " : ""}Scraping the site at: "${params.url}"`,
                  },
               ],
               details: { query: params.url },
            });

            const resultText = await executeScrape(params.url, ctx);

            return {
               content: [{ type: "text", text: resultText }],
               details: { markdownContent: resultText },
            };
         } catch (error) {
            console.error("Web scrape error:", error);
            return {
               content: [
                  {
                     type: "text",
                     text: `Web scrape failed: ${error instanceof Error ? error.message : String(error)}`,
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

   pi.registerCommand("scrape", {
      description: "Scrape a URL",
      handler: async (args, ctx) => {
         if (!args || args.trim() === "") {
            ctx.ui.notify("Usage: /scrape <URL>", "error");
            return;
         }

         const url = args.trim();

         // show loading status in footer with theme styling
         const theme = ctx.ui.theme;
         ctx.ui.setStatus(
            "web-scrape",
            theme.fg("muted", `${USE_NERD_FONT ? "\udb81\udf0f " : ""}Scraping the site at: "${url}"...`),
         );

         try {
            const toolResult = await executeScrape(url, ctx);

            // clear loading status
            ctx.ui.setStatus("web-scrape", undefined);

            pi.sendMessage({
               customType: "web-scrape-result",
               content: toolResult,
               display: true,
               details: { url, source: "slash-command" },
            });
         } catch (error) {
            ctx.ui.setStatus("web-scrape", undefined);
            ctx.ui.notify(`Web scrape failed: ${error instanceof Error ? error.message : String(error)}`, "error");
         }
      },
   });
}
