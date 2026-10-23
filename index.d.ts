export interface Commit {
    /** Full commit hash. */
    hash: string;
    /** First seven characters of the hash. */
    short: string;
    /** Author name (%an). */
    author: string;
    /** Author email (%ae). */
    email: string;
    /** Author date as strict ISO-8601 with the author's own offset (%aI). */
    date: string;
    /** First line of the message (%s). */
    subject: string;
    /** Remaining lines of the message (%b), newline-normalised. */
    body: string;
    /** Subject and body joined by a blank line. */
    message: string;
}

export interface Finding {
    /** Stable rule id, e.g. "lazy-messages". */
    id: string;
    /** Human-readable rule name. */
    title: string;
    /** How many commits the rule matched. */
    count: number;
    /** Maximum score penalty the rule can cost. */
    weight: number;
    /** Penalty actually applied for this run. */
    penalty: number;
    /** The roast line, always containing the real counts. */
    roast: string;
    /** Up to three `"<short hash> <subject>"` examples. */
    samples: string[];
}

export interface WorstCommit {
    hash: string;
    short: string;
    subject: string;
    /** Combined weight of every rule that matched this commit. */
    weight: number;
}

export type Grade = "S" | "A" | "B" | "C" | "D" | "F";

export interface RoastResult {
    repo: string | null;
    analyzed: number;
    score: number;
    grade: Grade;
    verdict: string;
    worst: WorstCommit | null;
    findings: Finding[];
}

export interface Rule {
    id: string;
    title: string;
    weight: number;
    test(commits: Commit[]): Commit[];
    roast(matches: Commit[], commits: Commit[]): string;
}

export interface RoastOptions {
    /** Repository name used in the report header. */
    repo?: string | null;
    /** Override the rule set (defaults to the built-in rules). */
    rules?: Rule[];
}

export interface ReportOptions {
    /** Emit ANSI colour. Defaults to false. */
    color?: boolean;
}

export interface ReadCommitsOptions {
    /** Directory to run git in. Defaults to process.cwd(). */
    cwd?: string;
    /** How many recent commits to read. Defaults to 50. */
    count?: number;
    /** Only commits whose author name or email contains this string. */
    author?: string | null;
}

export interface ReadCommitsResult {
    repo: string;
    root: string;
    commits: Commit[];
}

export interface Colors {
    enabled: boolean;
    reset(text: string): string;
    bold(text: string): string;
    dim(text: string): string;
    red(text: string): string;
    green(text: string): string;
    yellow(text: string): string;
    blue(text: string): string;
    magenta(text: string): string;
    cyan(text: string): string;
    gray(text: string): string;
}

export declare class GitError extends Error {
    readonly name: "GitError";
    readonly code: "GIT_MISSING" | "NOT_A_REPO" | "NO_COMMITS" | "GIT_FAILED";
    constructor(code: string, message: string);
}

/** The `--pretty=format:` argument this package feeds to `git log`. */
export declare const GIT_PRETTY_FORMAT: string;

/** Parse raw `git log` output (unit/record separated) into commits. */
export declare function parseGitLog(raw: string): Commit[];

/** Keep commits whose author name or email contains `needle`. */
export declare function filterByAuthor(commits: Commit[], needle?: string | null): Commit[];

/** Pure: run the rules over commits and produce the score and findings. */
export declare function roastCommits(commits: Commit[], options?: RoastOptions): RoastResult;

/** Pure: render a roast result as the terminal card. */
export declare function formatReport(result: RoastResult, options?: ReportOptions): string;

/** Pure: render a roast result as indented JSON. */
export declare function formatJson(result: RoastResult): string;

/** Impure: run git in `cwd` and return the parsed commits. */
export declare function readCommits(options?: ReadCommitsOptions): Promise<ReadCommitsResult>;

/** Build the argument list passed to `git log`. */
export declare function buildLogArgs(options?: { count?: number; author?: string | null }): string[];

/** Coerce a user-supplied commit count into a positive integer. */
export declare function normalizeCount(value: unknown, fallback?: number): number;

/** Penalty a rule costs given its weight and how many commits it matched. */
export declare function penaltyFor(weight: number, matched: number, total: number): number;

/** Grade band and verdict for a 0-100 score. */
export declare function gradeFor(score: number): { grade: Grade; min: number; verdict: string };

/** The built-in rule set. */
export declare const rules: Rule[];

/** Ids of the built-in rules, in declaration order. */
export declare const ruleIds: string[];

/** Look up a built-in rule by id. */
export declare function getRule(id: string): Rule | undefined;

export declare function isLazySubject(subject: string): boolean;
export declare function isConventional(subject: string): boolean;
export declare function isShouting(subject: string): boolean;

/** Build a palette; every function is the identity when colour is off. */
export declare function createColors(enabled?: boolean): Colors;

/** Whether ANSI colour should be used for the current environment. */
export declare function supportsColor(
    env?: Record<string, string | undefined>,
    stream?: { isTTY?: boolean },
): boolean;
