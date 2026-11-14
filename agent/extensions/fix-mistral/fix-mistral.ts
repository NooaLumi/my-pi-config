import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Workaround for #12148: Mistral stalls for minutes on tool calls when tools carry `strict: true`.
// Remove once https://github.com/earendil-works/pi/issues/12148 is closed
// Workaround by @davidbrai
export default function (pi: ExtensionAPI) {
   pi.on("before_provider_request", (event, ctx) => {
      if (ctx.model?.api !== "mistral-conversations") return;
      const payload = event.payload as { tools?: { function: { strict?: boolean } }[] };
      for (const tool of payload.tools ?? []) delete tool.function.strict;
      return payload;
   });
}
