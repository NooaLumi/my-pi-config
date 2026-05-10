import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const TODO_FILE = join(homedir(), "syncthing", "Notes", "todo.txt");

export default function (pi: ExtensionAPI) {
   pi.registerCommand("todo", {
      description: "read, add or remove todo items",
      handler: async (args, ctx) => {
         if (!args || args.trim() === "") {
            ctx.ui.notify(listTodos(ctx), "info");
            return;
         }

         const parts = args.trim().split(" ");
         const command = parts[0].toLowerCase();
         const rest = parts.slice(1).join(" ");

         try {
            if (command === "rm" || command === "remove") {
               removeTodo(rest, ctx);
            } else {
               addTodo(args.trim(), ctx);
            }
         } catch (error) {
            ctx.ui.notify(`/todo failed: ${error instanceof Error ? error.message : String(error)}`, "error");
         }
      },
   });
}

function listTodos(ctx: ExtensionCommandContext): string {
   if (!existsSync(TODO_FILE)) {
      return "No todo file found.";
   }

   const stats = statSync(TODO_FILE);
   if (stats.size === 0) {
      return "Todo list is empty.";
   }

   const content = readFileSync(TODO_FILE, "utf-8");
   const lines = content.split("\n").filter((line) => line.trim() !== "");

   if (lines.length === 0) {
      return "Todo list is empty.";
   }

   const displayLines = lines
      .slice(0, 15)
      .map((line, index) => `${String(index + 1).padStart(2)}: ${line}`)
      .join("\n");

   return `${ctx.ui.theme.fg("dim", "---------------------------------------------------- todo list (15 newest)")}\n${ctx.ui.theme.fg("muted", displayLines)}`;
}

function addTodo(item: string, ctx: ExtensionCommandContext): void {
   if (!item) {
      ctx.ui.notify("Error: No todo item provided", "error");
      ctx.ui.notify('Usage: /todo "Todo item here"', "info");
      return;
   }

   if (!existsSync(TODO_FILE)) {
      ctx.ui.notify("No todo file found.", "error");
      return;
   }

   const currentContent = readFileSync(TODO_FILE, "utf-8");
   const newContent = `${item}\n${currentContent}`;

   writeFileSync(TODO_FILE, newContent);
   ctx.ui.notify(`${ctx.ui.theme.fg("accent", "Added:")} ${item}\n${listTodos(ctx)}`, "info");
}

function removeTodo(item: string, ctx: ExtensionCommandContext): void {
   if (!item) {
      ctx.ui.notify("Error: No todo item number provided", "error");
      ctx.ui.notify("Usage: /todo rm <number>", "info");
      return;
   }

   if (!existsSync(TODO_FILE)) {
      ctx.ui.notify("No todo file found.", "error");
      return;
   }

   const index = parseInt(item, 10) - 1;
   if (Number.isNaN(index) || index < 0) {
      ctx.ui.notify("Error: Invalid item number", "error");
      return;
   }

   const content = readFileSync(TODO_FILE, "utf-8");
   const lines = content.split("\n").filter((line) => line.trim() !== "");

   if (index >= Math.min(lines.length, 15)) {
      ctx.ui.notify("Error: Item number out of range", "error");
      return;
   }

   const removed = lines.splice(index, 1);
   const newContent = lines.join("\n");

   writeFileSync(TODO_FILE, newContent);
   ctx.ui.notify(`${ctx.ui.theme.fg("accent", "Removed:")} ${removed}\n${listTodos(ctx)}`, "info");
}
