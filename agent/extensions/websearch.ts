import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Markdown } from "@mariozechner/pi-tui";
import { Mistral } from "@mistralai/mistralai";
import type { ConversationResponse } from "@mistralai/mistralai/models/components";
import { Type } from "@sinclair/typebox";

const USE_NERD_FONT = true; // * NOTE: toggle this off if your font doesn't support Nerd Font icons

const COMPLETION_ARGS = {
   temperature: 0.1,
   maxTokens: 2048,
   topP: 0.1,
};

const TOOLS = [
   {
      tool_configuration: null,
      type: "web_search" as const,
      open_results: false,
   },
];

const INSTRUCTIONS = `You are a focused assistant that searches the web.
You must always search the web for answers.
ALWAYS provide sources for all information.
Do not ask follow-up questions, but if relevant, provide links for further reading.
Keep answers concise and without fluff, but include all important information without omissions.
Respond in markdown format with no other markup.`;

export default function (pi: ExtensionAPI) {
   pi.registerTool({
      name: "websearch",
      label: "Web Search",
      description: "Search the internet using a Mistral AI web search agent",
      parameters: Type.Object({
         query: Type.String({
            description: "The search query or question to look up on the internet",
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

            // get mistral API key from auth storage
            const mistralKey = await ctx.modelRegistry.authStorage.getApiKey("mistral");

            if (!mistralKey) {
               throw new Error("Mistral API key not found in auth storage");
            }

            const client = new Mistral({
               apiKey: mistralKey,
            });

            const response = await client.beta.conversations.start({
               inputs: `${params.query}. Format response as pure markdown`,
               model: "mistral-small-latest",
               instructions: INSTRUCTIONS,
               completionArgs: COMPLETION_ARGS,
               tools: TOOLS,
            });

            // based on https://docs.mistral.ai/studio-api/agents/agent-tools/websearch#explanation-of-the-output
            // as well as provided typescript types (MessageOutputContentChunks)
            // horrible documentation, but the API is still in beta I suppose
            const parseMistralResponse = (response: ConversationResponse) => {
               if (!response.outputs || !(response.outputs.length > 0)) return "";

               const parsedResponse = response.outputs.reduce((formattedOutput, output) => {
                  if (output.type !== "message.output") return formattedOutput;

                  if (typeof output.content === "string") {
                     return formattedOutput + output.content;
                  }

                  if (Array.isArray(output.content)) {
                     return (
                        formattedOutput +
                        output.content.reduce((acc, item) => {
                           if (item.type === "tool_reference") {
                              return `${acc}\n${USE_NERD_FONT ? "\udb81\udf0f " : ""}[${item.title}](${item.url})`;
                           } else if (item.type === "text") {
                              // sometimes text section begins with a period sign for no fucking reason at all so drop that
                              return `${acc}\n${item.text?.[0] === "." ? item.text.slice(1) : item.text}`;
                           } else {
                              return `${acc}\n${JSON.stringify(item)}`;
                           }
                        }, "")
                     );
                  }

                  // fall back to json string (should never happen)
                  return formattedOutput + JSON.stringify(output.content);
               }, "");

               // another fall back to json just in case
               return !parsedResponse.trim() ? JSON.stringify(response) : parsedResponse;
            };

            const resultText = parseMistralResponse(response);

            return {
               content: [{ type: "text", text: resultText }],
               details: { response, markdownContent: resultText },
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

         // prefer explicit markdown details set by execute().
         const markdownText =
            result.details && typeof result.details === "object" && "markdownContent" in result.details
               ? String((result.details as { markdownContent?: unknown }).markdownContent ?? "")
               : "";

         if (markdownText.trim()) {
            return new Markdown(markdownText, 1, 1, markdownTheme);
         }

         // fall back to text content when markdownContent is missing
         const fallback = result.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n\n");

         return new Markdown(fallback || "(no content)", 1, 1, markdownTheme);
      },
   });
}
