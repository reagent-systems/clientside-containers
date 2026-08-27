/**
 * Browser Node.js runtime via WebContainer — boots once, then mounts and
 * spawns real npm CLIs (Claude Code, Gemini CLI).
 *
 * Requires cross-origin isolation (COOP/COEP or the COI service worker).
 */

import { WebContainer, type FileSystemTree, type WebContainerProcess } from "@webcontainer/api";
import type { NodeCliProfile } from "./node-cli";

let instance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;
const installed = new Set<string>();

export function isCrossOriginIsolated(): boolean {
  return typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
}

export async function bootWebContainer(): Promise<WebContainer> {
  if (instance) return instance;
  if (!bootPromise) {
    bootPromise = WebContainer.boot({
      workdirName: "workspace",
      forwardPreviewErrors: true,
    })
      .then((wc) => {
        instance = wc;
        return wc;
      })
      .catch((err) => {
        bootPromise = null;
        throw err;
      });
  }
  return bootPromise;
}

export async function teardownWebContainer(): Promise<void> {
  if (instance) {
    instance.teardown();
    instance = null;
  }
  bootPromise = null;
  installed.clear();
}

function packageTree(profile: NodeCliProfile): FileSystemTree {
  return {
    "package.json": {
      file: {
        contents: JSON.stringify(
          {
            name: `${profile.id}-bottle`,
            private: true,
            type: "module",
            dependencies: {
              [profile.packageName]: "*",
            },
          },
          null,
          2,
        ),
      },
    },
    "README.md": {
      file: {
        contents: `# ${profile.label}\n\nReal ${profile.vendor} CLI inside a WebContainer.\n`,
      },
    },
  };
}

async function ensureWorkdir(wc: WebContainer, profile: NodeCliProfile): Promise<void> {
  try {
    await wc.fs.readdir(profile.workdir);
  } catch {
    await wc.fs.mkdir(profile.workdir, { recursive: true });
    await wc.mount(packageTree(profile), { mountPoint: profile.workdir });
  }
}

export async function pipeProcessOutput(
  proc: WebContainerProcess,
  onData: (chunk: string) => void,
): Promise<number> {
  proc.output.pipeTo(
    new WritableStream({
      write(data) {
        onData(data);
      },
    }),
  );
  return proc.exit;
}

/**
 * Install the CLI package once per workdir for this browser session.
 * Streams npm install output through `onData`.
 */
export async function ensureNodeCliInstalled(
  profile: NodeCliProfile,
  onData: (chunk: string) => void,
): Promise<WebContainer> {
  const wc = await bootWebContainer();
  await ensureWorkdir(wc, profile);

  if (installed.has(profile.id)) {
    onData(`\r\n[${profile.label}] dependencies already installed\r\n`);
    return wc;
  }

  onData(`\r\n[${profile.label}] npm install ${profile.packageName}…\r\n`);
  const install = await wc.spawn("npm", ["install"], { cwd: profile.workdir });
  const code = await pipeProcessOutput(install, onData);
  if (code !== 0) {
    throw new Error(`npm install failed (exit ${code})`);
  }
  installed.add(profile.id);
  onData(`\r\n[${profile.label}] install complete\r\n`);
  return wc;
}

export type SpawnedCli = {
  process: WebContainerProcess;
  input: WritableStreamDefaultWriter<string>;
};

/**
 * Spawn the real CLI binary with a PTY-sized terminal and API key env.
 */
export async function spawnNodeCli(
  profile: NodeCliProfile,
  opts: {
    apiKey: string;
    cols: number;
    rows: number;
    onData: (chunk: string) => void;
  },
): Promise<SpawnedCli> {
  const wc = await ensureNodeCliInstalled(profile, opts.onData);
  const env: Record<string, string> = {
    [profile.apiKeyEnv]: opts.apiKey,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    FORCE_COLOR: "1",
  };
  // Gemini also accepts GOOGLE_API_KEY in some versions.
  if (profile.id === "gemini-cli" && opts.apiKey) {
    env.GOOGLE_API_KEY = opts.apiKey;
  }

  opts.onData(`\r\n[${profile.label}] starting \`${profile.bin}\`…\r\n`);
  const process = await wc.spawn("npx", ["--no-install", profile.bin], {
    cwd: profile.workdir,
    terminal: { cols: opts.cols, rows: opts.rows },
    env,
  });
  void pipeProcessOutput(process, opts.onData);
  const input = process.input.getWriter();
  return { process, input };
}
