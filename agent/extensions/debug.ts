import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeFileSync } from "fs";

export default function (pi: ExtensionAPI) {
   pi.on("before_provider_request", (event, ctx) => {
   const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
     writeFileSync(`/tmp/pi-payload-${timestamp}.json`, JSON.stringify(event.payload, null, 2));
   });
}