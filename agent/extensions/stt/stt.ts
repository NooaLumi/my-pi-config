import { type ChildProcess, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Key, Markdown, matchesKey } from "@earendil-works/pi-tui";
import { Mistral } from "@mistralai/mistralai";
import { Type } from "@sinclair/typebox";

import { existsSync, mkdirSync, readFileSync } from "fs";

const USE_NERD_FONT = true;

function getIcon(): string {
   return USE_NERD_FONT ? "\udb81\udf0f " : "";
}

function getRecordingsDir(): string {
   const __dirname = dirname(fileURLToPath(import.meta.url));
   const recordingsDir = join(__dirname, "..", "..", "..", "recordings");
   if (!existsSync(recordingsDir)) {
      mkdirSync(recordingsDir, { recursive: true });
   }
   return recordingsDir;
}

function generateRecordingPath(): string {
   const dir = getRecordingsDir();
   const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
   return join(dir, `recording-${timestamp}.mp3`);
}

async function transcribeAudio(filePath: string, ctx: any): Promise<string> {
   const mistralKey = await ctx.modelRegistry.authStorage.getApiKey("mistral");

   if (!mistralKey) {
      throw new Error('Mistral API key not found. Add it to ~/.pi/agent/auth.json with key: "mistral"');
   }

   // Read the audio file
   const audioFile = readFileSync(filePath);

   const client = new Mistral({
      apiKey: mistralKey,
   });

   const transcriptionResponse = await client.audio.transcriptions.complete({
      model: "voxtral-mini-latest",
      file: {
         fileName: filePath.split("/").pop() || "audio",
         content: audioFile,
      },
   });

   if (!transcriptionResponse.text) {
      throw new Error("No transcription returned from Mistral API");
   }

   return transcriptionResponse.text;
}

async function copyToClipboard(text: string, ctx: any): Promise<boolean> {
   try {
      const clipProcess = spawn("xclip", ["-selection", "clipboard"], {
         stdio: ["pipe", "ignore", "ignore"],
      });
      clipProcess.stdin.end(text);
      await new Promise<void>((resolve, reject) => {
         clipProcess.on("close", (code) => (code === 0 ? resolve() : reject(new Error("xclip failed"))));
         clipProcess.on("error", reject);
      });
      ctx.ui.notify("Transcription copied to clipboard!", "info");
      return true;
   } catch (clipboardError) {
      console.error("Failed to copy to clipboard:", clipboardError);
      ctx.ui.notify("Transcription complete (clipboard copy failed)", "warning");
      return false;
   }
}

interface RecordingComponentResult {
   filePath: string;
   transcribe: boolean;
}

function createRecordingComponent(
   tui: { requestRender: () => void },
   theme: any,
   onDone: (result: RecordingComponentResult | null) => void,
): {
   render: (width: number) => string[];
   handleInput: (data: string) => void;
   invalidate: () => void;
   dispose: () => void;
} {
   const filePath = generateRecordingPath();
   const startTime = Date.now();
   let recordingProcess: ChildProcess | null = null;
   let stopped = false;
   let updateInterval: ReturnType<typeof setInterval> | null = null;

   // Start recording immediately
   recordingProcess = spawn("ffmpeg", ["-f", "pulse", "-i", "default", "-y", filePath], {
      stdio: ["ignore", "ignore", "ignore"],
   });

   recordingProcess.on("error", (err) => {
      console.error("FFmpeg error:", err);
   });

   // Start update interval for timer display
   updateInterval = setInterval(() => {
      tui.requestRender();
   }, 100);

   function stopRecording(): void {
      if (recordingProcess && !stopped) {
         stopped = true;
         recordingProcess.kill("SIGINT");
         recordingProcess = null;
      }
      if (updateInterval) {
         clearInterval(updateInterval);
         updateInterval = null;
      }
   }

   return {
      render(width: number): string[] {
         const elapsed = Math.floor((Date.now() - startTime) / 1000);
         const minutes = Math.floor(elapsed / 60);
         const seconds = elapsed % 60;
         const timeStr = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
         const icon = getIcon();

         return [
            theme.fg("accent", "─".repeat(width)),
            theme.fg("text", ` ${icon}Recording... Press ENTER to stop`),
            theme.fg("muted", ` Time: ${timeStr}`),
            theme.fg("dim", ` File: ${filePath}`),
            theme.fg("accent", "─".repeat(width)),
         ];
      },
      handleInput(data: string): void {
         if (matchesKey(data, Key.enter) && !stopped) {
            stopRecording();
            // Wait for ffmpeg write
            setTimeout(() => {
               onDone({ filePath, transcribe: false });
            }, 500);
         }
      },
      invalidate(): void {},
      dispose(): void {
         stopRecording();
      },
   };
}

export default function (pi: ExtensionAPI) {
   pi.registerTool({
      name: "stt",
      label: "Speech to Text",
      description: "Transcribe audio files to text",
      parameters: Type.Object({
         filePath: Type.String({
            description: "Path to the audio file to transcribe",
         }),
      }),
      async execute(_toolCallId, params, _signal, onUpdate, ctx) {
         try {
            onUpdate?.({
               content: [
                  {
                     type: "text",
                     text: `${getIcon()}Transcribing audio file: "${params.filePath}"`,
                  },
               ],
               details: { filePath: params.filePath },
            });

            const resultText = await transcribeAudio(params.filePath, ctx);

            return {
               content: [{ type: "text", text: resultText }],
               details: { markdownContent: resultText, filePath: params.filePath },
            };
         } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("STT error:", error);

            return {
               content: [
                  {
                     type: "text",
                     text: `Transcription failed: ${errorMessage}`,
                  },
               ],
               details: { markdownContent: "", filePath: params.filePath },
               isError: true,
            };
         }
      },
      renderResult(result, _options, _theme, _context) {
         const markdownTheme = getMarkdownTheme();

         const details = result.details as { markdownContent?: string; filePath?: string } | undefined;
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

   pi.registerCommand("stt", {
      description: "Transcribe audio to text. No args = record, else provide path to audio file",
      handler: async (args, ctx) => {
         if (!ctx.hasUI) {
            ctx.ui.notify("Recording requires interactive mode", "error");
            return;
         }

         const theme = ctx.ui.theme;

         // ----- Interactive recording mode (no filepath provided) ----- //
         if (!args || args.trim() === "") {
            const result = await ctx.ui.custom<RecordingComponentResult | null>((tui, theme, _kb, done) => {
               return createRecordingComponent(tui, theme, (result) => {
                  done(result);
               });
            });

            if (!result) return;

            // Show the recorded file path and ask to transcribe
            ctx.ui.notify(`Recorded: ${result.filePath}`, "info");

            const transcribe = await ctx.ui.confirm("Transcribe?", `Send "${result.filePath}" to STT service?`);

            if (!transcribe) {
               return;
            }

            // Show loading status in footer
            ctx.ui.setStatus("stt", theme.fg("muted", `${getIcon()}Transcribing audio file: "${result.filePath}"...`));

            try {
               const toolResult = await transcribeAudio(result.filePath, ctx);
               ctx.ui.setStatus("stt", undefined);

               // Ask to use as prompt to AI or just copy to clipboard
               const action = await ctx.ui.select("Transcription ready", ["Send as user message", "Copy to clipboard"]);

               if (action === "Send as user message") {
                  pi.sendUserMessage(toolResult);
               } else {
                  await copyToClipboard(toolResult, ctx);

                  pi.sendMessage({
                     customType: "stt-result",
                     content: `${toolResult}`,
                     display: true,
                     details: { filePath: result.filePath, source: "slash-command" },
                  });
               }
            } catch (error) {
               ctx.ui.setStatus("stt", undefined);
               const errorMessage = error instanceof Error ? error.message : String(error);
               ctx.ui.notify(`Transcription failed: ${errorMessage}`, "error");
            }

            return;
         }

         // ----- Filepath mode (no recording) ----- //
         const filePath = args.trim();

         // Show loading status in footer
         ctx.ui.setStatus("stt", theme.fg("muted", `${getIcon()}Transcribing audio file: "${filePath}"...`));

         try {
            const toolResult = await transcribeAudio(filePath, ctx);
            ctx.ui.setStatus("stt", undefined);

            pi.sendMessage({
               customType: "stt-result",
               content: toolResult,
               display: true,
               details: { filePath, source: "slash-command" },
            });
         } catch (error) {
            ctx.ui.setStatus("stt", undefined);
            const errorMessage = error instanceof Error ? error.message : String(error);
            ctx.ui.notify(`Transcription failed: ${errorMessage}`, "error");
         }
      },
   });
}
