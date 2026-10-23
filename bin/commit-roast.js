#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCommits } from "../src/git.js";
import { roastCommits } from "../src/score.js";
import { formatReport, formatJson } from "../src/report.js";
import { normalizeCount } from "../src/git.js";
import { supportsColor } from "../src/colors.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function version() {
    try {
        const pkg = JSON.parse(readFileSync(path.join(here, "..", "package.json"), "utf8"));
        return pkg.version ?? "0.0.0";
    } catch {
        return "0.0.0";
    }
}

const HELP = `commit-roast — a funny but accurate roast of your git commit messages.

Usage
  commit-roast [options]

Options
  -n, --count <n>     how many recent commits to analyse (default 50)
  -a, --author <s>    only commits whose author name or email contains <s>
      --all           all authors (default)
      --json          machine-readable output instead of the report
      --no-color      disable ANSI colour
  -h, --help          show this help
  -v, --version       print the version

Everything runs offline against the git repository in the current directory.
No network calls, no AI, no writes.`;

export function parseArgs(argv) {
    const options = { count: 50, author: null, json: false, color: null, help: false, version: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "-h" || arg === "--help") {
            options.help = true;
        } else if (arg === "-v" || arg === "--version") {
            options.version = true;
        } else if (arg === "--json") {
            options.json = true;
        } else if (arg === "--no-color" || arg === "--no-colour") {
            options.color = false;
        } else if (arg === "--color" || arg === "--colour") {
            options.color = true;
        } else if (arg === "--all") {
            options.author = null;
        } else if (arg === "-n" || arg === "--count") {
            options.count = normalizeCount(argv[++i]);
        } else if (arg.startsWith("--count=")) {
            options.count = normalizeCount(arg.slice("--count=".length));
        } else if (arg === "-a" || arg === "--author") {
            options.author = argv[++i] ?? null;
        } else if (arg.startsWith("--author=")) {
            options.author = arg.slice("--author=".length) || null;
        } else {
            throw new Error(`unknown option: ${arg}`);
        }
    }
    return options;
}

async function main(argv) {
    let options;
    try {
        options = parseArgs(argv);
    } catch (error) {
        process.stderr.write(`commit-roast: ${error.message}\n\n${HELP}\n`);
        return 1;
    }

    if (options.help) {
        process.stdout.write(`${HELP}\n`);
        return 0;
    }
    if (options.version) {
        process.stdout.write(`${version()}\n`);
        return 0;
    }

    let data;
    try {
        data = await readCommits({ count: options.count, author: options.author });
    } catch (error) {
        process.stderr.write(`commit-roast: ${error.message}\n`);
        return 1;
    }

    if (data.commits.length === 0) {
        const who = options.author ? ` for author matching "${options.author}"` : "";
        process.stderr.write(`commit-roast: no commits found${who} — nothing to roast\n`);
        return 1;
    }

    const result = roastCommits(data.commits, { repo: data.repo });

    if (options.json) {
        process.stdout.write(`${formatJson(result)}\n`);
        return 0;
    }

    const color = options.color === null ? supportsColor() : options.color;
    process.stdout.write(`${formatReport(result, { color })}\n`);
    return 0;
}

main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
}, (error) => {
    process.stderr.write(`commit-roast: ${error?.message ?? error}\n`);
    process.exitCode = 1;
});
