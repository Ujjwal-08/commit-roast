import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { GIT_PRETTY_FORMAT, parseGitLog, filterByAuthor } from "./parse.js";

const run = promisify(execFile);

const DEFAULT_COUNT = 50;
const MAX_BUFFER = 32 * 1024 * 1024;

export class GitError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "GitError";
        this.code = code;
    }
}

function escapeForRegex(value) {
    return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

export function normalizeCount(value, fallback = DEFAULT_COUNT) {
    const number = Number(value);
    if (!Number.isFinite(number) || Math.trunc(number) < 1) return fallback;
    return Math.min(Math.trunc(number), 100000);
}

/** Build the argument list passed to `git log`. Exported so it can be tested. */
export function buildLogArgs({ count = DEFAULT_COUNT, author = null } = {}) {
    const args = ["log"];
    if (author) {
        args.push("-i", `--author=${escapeForRegex(author)}`);
    }
    args.push("-n", String(normalizeCount(count)), GIT_PRETTY_FORMAT);
    return args;
}

function translate(error) {
    if (error && error.code === "ENOENT") {
        return new GitError("GIT_MISSING", "git was not found on PATH — install git and try again");
    }
    const text = `${error?.stderr ?? ""}${error?.message ?? ""}`.toLowerCase();
    if (text.includes("not a git repository")) {
        return new GitError("NOT_A_REPO", "not a git repository — run this inside one");
    }
    if (text.includes("does not have any commits") || text.includes("bad default revision")) {
        return new GitError("NO_COMMITS", "this repository has no commits yet — nothing to roast");
    }
    return new GitError("GIT_FAILED", `git failed: ${(error?.stderr || error?.message || "unknown error").trim()}`);
}

/**
 * Impure: shell out to git in `cwd` and return the parsed commits.
 * Resolves to { repo, commits }. Throws GitError with a `code` on failure.
 */
export async function readCommits(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const count = normalizeCount(options.count);
    const author = options.author ?? null;

    let root;
    try {
        const { stdout } = await run("git", ["rev-parse", "--show-toplevel"], { cwd, maxBuffer: MAX_BUFFER });
        root = stdout.trim();
    } catch (error) {
        throw translate(error);
    }

    let raw;
    try {
        const { stdout } = await run("git", buildLogArgs({ count, author }), { cwd, maxBuffer: MAX_BUFFER });
        raw = stdout;
    } catch (error) {
        throw translate(error);
    }

    const commits = filterByAuthor(parseGitLog(raw), author);
    return {
        repo: path.basename(root || cwd) || "this repo",
        root: root || cwd,
        commits,
    };
}
