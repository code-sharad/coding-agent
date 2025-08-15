import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod/v4";
import { type Sandbox } from "@vercel/sandbox";
import {
  createPR,
  createSandbox,
  editFile,
  listFiles,
  readFile,
} from "./sandbox";

import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

type TypeAccessToken = { email: string; token: string };
export async function codingAgent(
  prompt: string,
  repoUrl?: string,
  accArr?: TypeAccessToken,
  onLog?: (message: unknown) => void
) {
  const log = (message: unknown) => {
    try {
      if (onLog) onLog(message);
    } catch { }
    // Always mirror to server logs
    try {
      if (typeof message === "string") console.log(message);
      else console.log(JSON.stringify(message));
    } catch { }
  };

  log(`🚀 Starting coding agent for: ${repoUrl ?? "<no repo>"}`);
  let sandbox: Sandbox | undefined;

  const result = await generateText({
    model: openrouter.chat('qwen/qwen3-coder'),
    prompt,
    system:
      `You are Qwen3 Coder, a large language model specialized in JavaScript and TypeScript development. You have access to the following tools to assist with coding tasks:

1. \`list_files\` - List files in a directory
2. \`read_file\` - Read the contents of a file
3. \`edit_file\` - Modify or create a file
4. \`create_pr\` - Create a pull request with your changes

Your role is to assist users with coding tasks such as:
- Writing and reviewing code
- Debugging and optimizing existing code
- Explaining code functionality
- Suggesting best practices and improvements
- Assisting with project structure and architecture

When working on coding tasks:
1. Always prioritize correctness, readability, and maintainability.
2. Follow standard JS/TS conventions and idiomatic patterns.
3. Provide concise, well-documented code with clear variable and function names.
4. Include comments where necessary to explain complex logic.
5. When modifying files, ensure your changes integrate seamlessly with the existing codebase.
6. After making changes, always run the \`create_pr\` tool to submit your work.

CRITICAL: You MUST complete the entire task before responding. Do not provide explanatory text or status updates. Focus on using the tools to implement the complete solution. Only after you have made ALL necessary file changes should you run \`create_pr\` to submit your work. Never stop in the middle of a task - always see it through to completion.

IMPORTANT: When using \`edit_file\`, ensure exact string matching:
- Read the file first with \`read_file\` to see the exact content
- Copy the exact text including whitespace, quotes, and formatting
- For complex edits, use smaller, more specific string replacements
- If a string match fails, read the file again to verify the exact content

Before starting any task, you may use \`list_files\` to understand the project structure. Use \`read_file\` to examine existing code, and \`edit_file\` to make necessary changes. Remember to finish all tasks by executing \`create_pr\` to properly submit your work.`,
    stopWhen: stepCountIs(30),
    tools: {
      read_file: tool({
        description:
          "Read the contents of a given relative file path. Use this when you want to see what's inside a file. Do not use this with directory names.",
        inputSchema: z.object({
          path: z
            .string()
            .describe("The relative path of a file in the working directory."),
        }),
        execute: async ({ path }) => {
          try {
            if (!sandbox) {
              log("📦 Creating sandbox...");
              sandbox = await createSandbox(repoUrl!, accArr as TypeAccessToken);
              log("✅ Sandbox ready");
            }
            log(`📖 Reading file: ${path}`);
            const output = await readFile(sandbox, path);
            log(`✅ File read successfully: ${path}`);
            return { path, output };
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            log(`❌ Error reading file ${path}: ${msg}`);
            return { path, error: msg };
          }
        },
      }),
      list_files: tool({
        description:
          "List files and directories at a given path. If no path is provided, lists files in the current directory.",
        inputSchema: z.object({
          path: z
            .string()
            .nullable()
            .describe(
              "Optional relative path to list files from. Defaults to current directory if not provided.",
            ),
        }),
        execute: async ({ path }) => {
          if (path === ".git" || path === "node_modules") {
            const msg = `🚫 Cannot access restricted path: ${path}`;
            log(msg);
            return { error: msg, path };
          }
          try {
            if (!sandbox) {
              log("📦 Creating sandbox...");
              sandbox = await createSandbox(repoUrl!, accArr as TypeAccessToken);
              log("✅ Sandbox ready");
            }
            log(`📁 Listing files in: ${path ?? "."}`);
            const output = await listFiles(sandbox, path);
            log(`✅ ${output}`);
            // Emit a structured event for the UI to render
            try {
              log({ event: "file_list", data: { path: path ?? ".", output } });
            } catch { }
            return { path, output };
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            log(`❌ Error listing files: ${msg}`);
            return { error: msg };
          }
        },
      }),
      edit_file: tool({
        description:
          "Make edits to a text file. Replaces 'old_str' with 'new_str' in the given file. 'old_str' and 'new_str' MUST be different from each other. If the file specified with path doesn't exist, it will be created. CRITICAL: The 'old_str' must match EXACTLY - including all whitespace, quotes, and formatting. Use read_file first to see the exact content.",
        inputSchema: z.object({
          path: z.string().describe("The path to the file"),
          old_str: z
            .string()
            .describe(
              "Text to search for - must match exactly including all whitespace, quotes, and formatting. Use read_file first to copy the exact text.",
            ),
          new_str: z.string().describe("Text to replace old_str with"),
        }),
        execute: async ({ path, old_str, new_str }) => {
          try {
            if (!sandbox) {
              log("📦 Creating sandbox...");
              sandbox = await createSandbox(repoUrl!, accArr as TypeAccessToken);
              log("✅ Sandbox ready");
            }
            log(`✏️ Editing file: ${path}`);
            log(`🔍 Looking for: "${old_str.slice(0, 100)}${old_str.length > 100 ? '...' : ''}"`);
            const result = await editFile(sandbox, path, old_str, new_str);
            if (result.success) {
              log(`✅ File edited successfully: ${path}`);
              // Emit structured diff for UI
              if (typeof result.before === 'string' && typeof result.after === 'string') {
                try {
                  log({ event: "file_diff", data: { path, before: result.before, after: result.after } });
                } catch { }
              }
            } else {
              log(`❌ Edit failed: ${result.error}`);
              log(`💡 Tip: Use read_file to verify exact content and formatting`);
            }
            return result;
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            log(`❌ Error editing file ${path}: ${msg}`);
            return { error: msg };
          }
        },
      }),
      create_pr: tool({
        description:
          "Create a pull request with the current changes. This will add all files, commit changes, push to a new branch, and create a PR using GitHub's REST API. Use this as the final step when making changes.",
        inputSchema: z.object({
          title: z.string().describe("The title of the pull request"),
          body: z.string().describe("The body/description of the pull request"),
          branch: z
            .string()
            .nullable()
            .describe(
              "The name of the branch to create (defaults to a generated name)",
            ),
        }),
        execute: async ({ title, body, branch }) => {
          log(`🚀 Creating pull request: "${title}"`);
          log(`📝 Branch: ${branch ?? "auto-generated"}`);
          try {
            const result = await createPR(sandbox!, accArr as TypeAccessToken, repoUrl!, {
              title,
              body,
              branch,

            });
            if (result.pr_url) {
              log(`✅ Pull request created successfully!`);
              log(`🔗 PR URL: ${result.pr_url}`);
              // Emit structured event for the UI
              try {
                log({ event: "pr_created", data: { url: result.pr_url, branch: result.branch } });
              } catch { }
              return { success: true, linkToPR: result.pr_url };
            } else {
              log(`❌ Failed to create PR: ${result.error}`);
              return { error: result.error };
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            log(`❌ Error creating PR: ${msg}`);
            return { error: msg };
          }
        },
      }),
    },
  });

  if (sandbox) {
    try {
      await sandbox.stop();
      log("🔒 Sandbox stopped");
    } catch { }
  }

  const final = { response: result.text };
  log(`🎉 Agent completed: ${result.text}`);
  return final;
}