// Sandbox uses your  OIDC token to authenticate

import { Sandbox } from "@vercel/sandbox";
import ms from "ms";

export const createSandbox = async (repoUrl: string, accessToken: { email: string; token: string }) => {
  let authenticatedUrl = repoUrl;
  if (accessToken && repoUrl.includes("github.com")) {
    authenticatedUrl = repoUrl.replace(
      "https://github.com/",
      `https://${accessToken.token}@github.com/`
    );
  }
  const sandbox = await Sandbox.create({
    source: {
      url: authenticatedUrl,
      type: "git",
    },
    resources: { vcpus: 2 },
    timeout: ms("5m"),
    ports: [3000],
    runtime: "node22",
  });

  return sandbox;
};

export const readFile = async (sandbox: Sandbox, path: string) => {
  console.log(`Reading file: ${path}`);
  const result = await sandbox.runCommand("cat", [path]);
  const data = await result.output();
  console.log(`File read successfully: ${path} ${data}`);
  return { path, content: data.toString() };
};

export const listFiles = async (sandbox: Sandbox, path: string | null | undefined) => {
  const targetPath = path ? path : ".";
  console.log(`Listing files in: ${targetPath}`);
  const result = await sandbox.runCommand("ls", ["-la", targetPath]);
  const results = await result.output();
  console.log(`Files listed successfully for: ${targetPath}\n${results}`);
  return results.toString();
};

async function fileExists(sandbox: Sandbox, path: string) {
  const safe = path.replace(/'/g, "'\\''");
  const res = await sandbox.runCommand("bash", ["-lc", `[ -f '${safe}' ] && echo yes || echo no`]);
  const out = await res.output();
  return out.toString().includes("yes");
}

export const editFile = async (
  sandbox: Sandbox,
  path: string,
  old_str: string,
  new_str: string,
) => {
  console.log(`Editing file: ${path}`);
  if (typeof path !== "string" || typeof old_str !== "string" || typeof new_str !== "string") {
    return { error: "Invalid parameters: path, old_str and new_str must be strings" };
  }
  if (old_str === new_str) {
    return { error: "old_str and new_str must be different" };
  }
  // Read the file content using sandbox
  const exists = await fileExists(sandbox, path);
  let contentStr = "";
  if (exists) {
    const result = await sandbox
      .runCommand("cat", [path])
      .catch(() => ({ output: async () => "" }));
    const content = await result.output();
    contentStr = String(content || "");
  } else {
    console.log(`File does not exist, will create: ${path}`);
  }

  let updatedContent: string;
  if (!exists) {
    // Create new with new_str if file absent
    updatedContent = new_str;
  } else {
    updatedContent = contentStr.replace(old_str, new_str);
    if (contentStr === updatedContent) {
      console.log(`String "${old_str}" not found in file ${path}`);
      return { error: `String "${old_str}" not found in file` };
    }
  }

  // Validate and normalize content before writing to prevent undefined errors
  if (typeof updatedContent !== "string") {
    console.error(`Invalid updatedContent type: ${typeof updatedContent}, value:`, updatedContent);
    return { error: "Internal error: updated content is not a string" };
  }

  if (updatedContent === null || updatedContent === undefined) {
    console.error("updatedContent is null or undefined");
    return { error: "Internal error: updated content is null or undefined" };
  }

  // Ensure parent directory exists before writing
  const dirCmd = `mkdir -p "$(dirname "${path.replace(/"/g, '\\"')}")"`;
  await sandbox.runCommand("bash", ["-c", dirCmd]).catch(e => {
    console.warn("Failed to create directory:", e.message);
  });

  // Write the updated content back using sandbox writeFiles method
  console.log("Updated content length:", updatedContent.length);
  await sandbox.writeFiles([
    {
      path: path,
      content: Buffer.from(updatedContent, "utf8"),
    },
  ]);
  console.log(`File edited successfully: ${path}`);
  // Get updated file content to return for diff rendering
  const updatedResult = await sandbox.runCommand("cat", [path]);
  const updatedFileContent = (await updatedResult.output()).toString();
  // Avoid logging entire file content to keep logs concise
  return { success: true, path, before: contentStr, after: updatedFileContent };
};

export const createPR = async (
  sandbox: Sandbox,
  accessToken: { email: string; token: string },
  repoUrl: string,
  prDetails: { title: string; body: string; branch: string | null },
) => {
  try {
    if (!accessToken)
      throw new Error("GITHUB_TOKEN environment variable is required");

    const { title, body, branch } = prDetails;
    console.log(`Creating PR with title: ${title}, body: ${body}, branch: ${branch}`);

    const branchName = `${branch || `feature/ai-changes`}-${Date.now()}`;

    // Setup git
    await sandbox.runCommand("git", [
      "config",
      "user.email",
      accessToken.email,
    ]);
    await sandbox.runCommand("git", ["config", "user.name", "AI Coding Agent"]);

    const authUrl = repoUrl!.replace(
      "https://github.com/",
      `https://${accessToken.token}@github.com/`,
    );
    await sandbox.runCommand("git", ["remote", "set-url", "origin", authUrl]);

    // Create branch and commit changes
    await sandbox.runCommand("git", ["checkout", "-b", branchName]);
    await sandbox.runCommand("git", [
      "add",
      ".",
      ":!*.tar",
      ":!*.tar.gz",
      ":!*.tar.bz2",
      ":!*.tar.xz",
      ":!*.tgz",
      ":!*.tbz",
      ":!*.tbz2",
      ":!*.txz",
    ]);

    // Check if there are changes to commit
    const diffResult = await sandbox.runCommand("git", [
      "diff",
      "--cached",
      "--name-only",
    ]);
    const diffOutput = await diffResult.output();

    if (!diffOutput.toString().trim()) {
      // Create a minimal change if nothing to commit
      const timestamp = new Date().toISOString();
      await sandbox.runCommand("bash", [
        "-c",
        `echo "AI Agent Activity: ${timestamp}" > .ai-activity.md`,
      ]);
      await sandbox.runCommand("git", [
        "add",
        ".",
        ":!*.tar",
        ":!*.tar.gz",
        ":!*.tar.bz2",
        ":!*.tar.xz",
        ":!*.tgz",
        ":!*.tbz",
        ":!*.tbz2",
        ":!*.txz",
      ]);
    }

    await sandbox.runCommand("git", ["commit", "-m", title]);
    await sandbox.runCommand("git", ["push", "origin", branchName]);

    // Create PR via GitHub API
    const urlMatch = repoUrl!.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
    if (!urlMatch) throw new Error("Invalid GitHub repository URL");

    const [, owner, repo] = urlMatch;
    const prData = { title, body, head: branchName, base: "main" };

    const response = await sandbox.runCommand("curl", [
      "-s",
      "-X",
      "POST",
      "-H",
      `Authorization: token ${accessToken.token}`,
      "-H",
      "Accept: application/vnd.github.v3+json",
      "-H",
      "Content-Type: application/json",
      "-d",
      JSON.stringify(prData),
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
    ]);

    const result = JSON.parse((await response.output()).toString());

    if (result.html_url) {
      return {
        success: true,
        branch: branchName,
        pr_url: result.html_url,
        pr_number: result.number,
      };
    } else {
      throw new Error(result.message || "Failed to create PR");
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { error: msg };
  }
}