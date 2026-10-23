import { localParts, isLateNight, isWeekend } from "./time.js";

const LAZY_WORDS = new Set([
    "fix", "fixes", "fixed", "fixing",
    "wip", "update", "updates", "updated", "updating",
    "stuff", "things", "changes", "change", "changed",
    "test", "tests", "testing",
    "asdf", "asdfasdf", "qwerty", "aaa",
    "misc", "tweak", "tweaks", "minor", "small fix",
    "cleanup", "clean up", "temp", "tmp",
    "oops", "whoops", "commit", "save", "saving",
    "done", "ok", "okay", "again", "more", "stuff again",
    "foo", "bar", "baz", "blah", "init", "initial commit",
]);

const CONVENTIONAL = /^(?:feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)(?:\([^)]*\))?!?:\s*\S/i;

const FRUSTRATION = /\b(?:damn|dammit|damnit|crap|crappy|wtf|ugh|argh|aargh|grr+|finally|why|seriously|ffs|hate|stupid)\b/i;

const FINAL_FAMILY = /\b(?:final\d*|last\s+(?:fix|one|commit|try|attempt|change)|for\s+real(?:\s+this\s+time)?|no\s+really)\b/i;

const REVERT = /\brevert(?:s|ed|ing)?\b/i;

const TYPO = /\btypos?\b/i;

const MERGE = /^merge\b/i;

const EMOJI = /\p{Extended_Pictographic}/gu;

const SHORT_SUBJECT_LIMIT = 10;
const LONG_SUBJECT_LIMIT = 72;

function pct(part, total) {
    if (!total) return "0%";
    return `${Math.round((part / total) * 100)}%`;
}

function plural(count, one, many) {
    return count === 1 ? one : many;
}

function countEmoji(text) {
    const found = text.match(EMOJI);
    return found ? found.length : 0;
}

function hasLetters(text) {
    return /\p{L}/u.test(text);
}

function quote(text, max = 38) {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `"${flat.slice(0, max - 1)}…"` : `"${flat}"`;
}

/** True for one-word placeholder subjects such as "fix", "wip", "...". */
export function isLazySubject(subject) {
    const text = String(subject ?? "").trim().toLowerCase();
    if (text === "") return false;
    if (/^[.…!?-]+$/.test(text)) return true;
    const key = text.replace(/[\s!.?]+$/u, "");
    return LAZY_WORDS.has(key);
}

/** True when the subject carries a conventional-commits prefix. */
export function isConventional(subject) {
    return CONVENTIONAL.test(String(subject ?? "").trim());
}

/** True for subjects written entirely in capitals (at least four letters). */
export function isShouting(subject) {
    const text = String(subject ?? "").trim();
    const letters = text.replace(/[^\p{L}]/gu, "");
    if (letters.length < 4) return false;
    if (!/\p{Lu}/u.test(text)) return false;
    return text === text.toUpperCase();
}

function groupBySubject(commits) {
    const groups = new Map();
    for (const commit of commits) {
        const key = commit.subject.trim().toLowerCase();
        if (key === "") continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(commit);
    }
    return groups;
}

/**
 * Every rule: `test(commits)` returns the commits it matched (empty means the
 * rule does not fire) and `roast(matches, commits)` turns them into one line.
 * Weights are the maximum score penalty a rule can cost.
 */
export const rules = [
    {
        id: "lazy-messages",
        title: "placeholder messages",
        weight: 18,
        test: (commits) => commits.filter((c) => isLazySubject(c.subject)),
        roast: (matches, commits) => {
            const sample = quote(matches[0].subject);
            const noun = plural(matches.length, "is a placeholder like", "are placeholders like");
            return `${matches.length} of ${commits.length} commits ${noun} ${sample} — ${pct(matches.length, commits.length)} of your history is a shrug with a hash.`;
        },
    },
    {
        id: "short-subjects",
        title: "very short subjects",
        weight: 10,
        test: (commits) => commits.filter((c) => c.subject.length > 0 && c.subject.length < SHORT_SUBJECT_LIMIT),
        roast: (matches) => {
            const shortest = matches.reduce((a, b) => (b.subject.length < a.subject.length ? b : a));
            return `${matches.length} ${plural(matches.length, "subject is", "subjects are")} under ${SHORT_SUBJECT_LIMIT} characters, the shortest being ${quote(shortest.subject)} at ${shortest.subject.length} — a tweet limit would be generous here.`;
        },
    },
    {
        id: "long-subjects",
        title: "runaway subjects",
        weight: 8,
        test: (commits) => commits.filter((c) => c.subject.length > LONG_SUBJECT_LIMIT),
        roast: (matches) => {
            const longest = matches.reduce((a, b) => (b.subject.length > a.subject.length ? b : a));
            return `${matches.length} ${plural(matches.length, "subject runs", "subjects run")} past ${LONG_SUBJECT_LIMIT} characters (worst: ${longest.subject.length}) — that is not a subject, that is the body wearing a subject's coat.`;
        },
    },
    {
        id: "shouting",
        title: "all caps",
        weight: 8,
        test: (commits) => commits.filter((c) => isShouting(c.subject)),
        roast: (matches) => `${matches.length} ${plural(matches.length, "commit is", "commits are")} in ALL CAPS, starting with ${quote(matches[0].subject)} — git log is not a group chat you can win.`,
    },
    {
        id: "frustration",
        title: "frustration index",
        weight: 8,
        test: (commits) => commits.filter((c) => FRUSTRATION.test(c.message)),
        roast: (matches, commits) => {
            const hit = FRUSTRATION.exec(matches[0].message);
            const word = hit ? hit[0].toLowerCase() : "something unprintable";
            const verb = plural(matches.length, "leaks", "leak");
            return `${matches.length} of ${commits.length} commits ${verb} frustration — someone committed the word "${word}" to the permanent record. The history reads like a diary with a build step.`;
        },
    },
    {
        id: "final-family",
        title: "the final countdown",
        weight: 10,
        test: (commits) => commits.filter((c) => FINAL_FAMILY.test(c.subject)),
        roast: (matches) => `${matches.length} ${plural(matches.length, "commit claims", "commits claim")} to be the final one — including ${quote(matches[0].subject)}. Narrator: ${plural(matches.length, "it was", "none of them were")} final.`,
    },
    {
        id: "duplicate-messages",
        title: "copy-paste history",
        weight: 12,
        test: (commits) => {
            const groups = groupBySubject(commits);
            const matches = [];
            for (const group of groups.values()) {
                if (group.length > 1) matches.push(...group);
            }
            return matches;
        },
        roast: (matches) => {
            const groups = groupBySubject(matches);
            const repeated = [...groups.entries()].filter(([, group]) => group.length > 1);
            const worst = repeated.reduce((a, b) => (b[1].length > a[1].length ? b : a));
            return `${repeated.length} ${plural(repeated.length, "message is", "messages are")} used more than once across ${matches.length} commits — ${quote(worst[0])} alone appears ${worst[1].length} times. Ctrl+C, Ctrl+V, ship.`;
        },
    },
    {
        id: "no-conventional",
        title: "no conventional commits",
        weight: 14,
        test: (commits) => {
            const plainOnes = commits.filter((c) => !isConventional(c.subject));
            if (plainOnes.length === 0) return [];
            if (plainOnes.length / commits.length < 0.5) return [];
            return plainOnes;
        },
        roast: (matches, commits) => {
            const good = commits.length - matches.length;
            if (good === 0) {
                return `0 of ${commits.length} commits use a conventional-commit prefix — your changelog generator has filed for unemployment.`;
            }
            return `${matches.length} of ${commits.length} commits skip the conventional-commit prefix; only ${good} got it right — a convention observed ${pct(good, commits.length)} of the time is a rumour.`;
        },
    },
    {
        id: "emoji-heavy",
        title: "emoji overload",
        weight: 6,
        test: (commits) => commits.filter((c) => {
            const count = countEmoji(c.subject);
            return count >= 2 || (count >= 1 && !hasLetters(c.subject));
        }),
        roast: (matches) => {
            const total = matches.reduce((sum, c) => sum + countEmoji(c.subject), 0);
            return `${matches.length} ${plural(matches.length, "commit carries", "commits carry")} ${total} emoji between them — charades is a game, not a commit convention.`;
        },
    },
    {
        id: "late-night",
        title: "the 2am club",
        weight: 10,
        test: (commits) => commits.filter((c) => isLateNight(c.date)),
        roast: (matches, commits) => {
            const hours = matches.map((c) => localParts(c.date).hour);
            const darkest = Math.min(...hours);
            return `${matches.length} of ${commits.length} commits landed between 00:00 and 05:00, the earliest at ${String(darkest).padStart(2, "0")}:00 — welcome to the 2am club, where the tests are optional.`;
        },
    },
    {
        id: "weekend-warrior",
        title: "weekend warrior",
        weight: 6,
        test: (commits) => commits.filter((c) => isWeekend(c.date)),
        roast: (matches, commits) => `${matches.length} of ${commits.length} commits ${plural(matches.length, "was", "were")} authored on a Saturday or Sunday — the weekend called, you pushed it to a branch.`,
    },
    {
        id: "punctuation-screaming",
        title: "punctuation abuse",
        weight: 6,
        test: (commits) => commits.filter((c) => /(?:!{2,}|\?{2,})\s*$/.test(c.subject)),
        roast: (matches) => `${matches.length} ${plural(matches.length, "subject ends", "subjects end")} in a pile of !! or ?? — ${quote(matches[0].subject)}. The commit is not more fixed because you shouted at it.`,
    },
    {
        id: "revert-spiral",
        title: "revert spiral",
        weight: 12,
        test: (commits) => commits.filter((c) => REVERT.test(c.subject)),
        roast: (matches) => {
            const doubles = matches.filter((c) => /revert[^]*revert/i.test(c.subject));
            if (doubles.length > 0) {
                return `${matches.length} revert ${plural(matches.length, "commit", "commits")}, and ${doubles.length} of them revert a revert — you are not writing history, you are pacing in it.`;
            }
            return `${matches.length} revert ${plural(matches.length, "commit", "commits")} in this window — undo is a feature, not a workflow.`;
        },
    },
    {
        id: "typo-patrol",
        title: "typo patrol",
        weight: 6,
        test: (commits) => commits.filter((c) => TYPO.test(c.subject)),
        roast: (matches) => `${matches.length} ${plural(matches.length, "commit exists", "commits exist")} purely to fix a typo — a spellchecker costs nothing and never asks for a code review.`,
    },
    {
        id: "merge-flood",
        title: "merge flood",
        weight: 8,
        test: (commits) => {
            const merges = commits.filter((c) => MERGE.test(c.subject));
            if (merges.length < 3) return [];
            if (merges.length / commits.length < 0.2) return [];
            return merges;
        },
        roast: (matches, commits) => `${matches.length} of ${commits.length} commits are merge commits (${pct(matches.length, commits.length)}) — the log is mostly traffic reports about itself.`,
    },
];

export const ruleIds = rules.map((rule) => rule.id);

export function getRule(id) {
    return rules.find((rule) => rule.id === id);
}
