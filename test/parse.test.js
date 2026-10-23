import test from "node:test";
import assert from "node:assert/strict";
import { parseGitLog, filterByAuthor, GIT_PRETTY_FORMAT } from "../index.js";
import { buildLogArgs, normalizeCount } from "../src/git.js";

const US = "\u001F";
const RS = "\u001E";

function record(fields) {
    return fields.join(US) + RS;
}

const HASH_A = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const HASH_B = "0f1e2d3c4b5a69788796a5b4c3d2e1f098765432";

test("parseGitLog returns [] for empty, blank and non-string input", () => {
    assert.deepEqual(parseGitLog(""), []);
    assert.deepEqual(parseGitLog("\n\n"), []);
    assert.deepEqual(parseGitLog(undefined), []);
    assert.deepEqual(parseGitLog(null), []);
    assert.deepEqual(parseGitLog(42), []);
});

test("parseGitLog reads a single commit with an empty body", () => {
    const raw = record([HASH_A, "Ada Lovelace", "ada@example.com", "2026-03-10T14:30:00+05:30", "feat: add engine", ""]);
    const commits = parseGitLog(raw);
    assert.equal(commits.length, 1);
    assert.equal(commits[0].hash, HASH_A);
    assert.equal(commits[0].short, "a1b2c3d");
    assert.equal(commits[0].author, "Ada Lovelace");
    assert.equal(commits[0].email, "ada@example.com");
    assert.equal(commits[0].date, "2026-03-10T14:30:00+05:30");
    assert.equal(commits[0].subject, "feat: add engine");
    assert.equal(commits[0].body, "");
    assert.equal(commits[0].message, "feat: add engine");
});

test("parseGitLog keeps multi-line bodies intact", () => {
    const body = "line one\nline two\n\nline four";
    const raw = record([HASH_A, "Dev", "dev@example.com", "2026-03-10T14:30:00+00:00", "fix: thing", `${body}\n\n`]);
    const commits = parseGitLog(raw);
    assert.equal(commits.length, 1);
    assert.equal(commits[0].body, body);
    assert.equal(commits[0].message, `fix: thing\n\n${body}`);
    assert.ok(commits[0].body.includes("\n\nline four"));
});

test("parseGitLog splits multiple records joined by newlines", () => {
    const raw = [
        record([HASH_A, "Ada", "ada@example.com", "2026-03-10T14:30:00+00:00", "feat: one", "body\nwith lines"]),
        record([HASH_B, "Linus", "linus@example.com", "2026-03-11T09:00:00+00:00", "fix: two", ""]),
    ].join("\n");
    const commits = parseGitLog(raw);
    assert.equal(commits.length, 2);
    assert.deepEqual(commits.map((c) => c.subject), ["feat: one", "fix: two"]);
    assert.equal(commits[1].short, "0f1e2d3");
});

test("parseGitLog normalises CRLF line endings", () => {
    const raw = record([HASH_A, "Dev", "dev@example.com", "2026-03-10T14:30:00+00:00", "fix: crlf", "first\r\nsecond\r\n"]) + "\r\n";
    const commits = parseGitLog(raw);
    assert.equal(commits.length, 1);
    assert.equal(commits[0].body, "first\nsecond");
    assert.ok(!commits[0].body.includes("\r"));
    assert.ok(!commits[0].subject.includes("\r"));
});

test("parseGitLog handles unicode subjects and bodies", () => {
    const raw = record([HASH_A, "Ujjwal Dadhich", "u@example.com", "2026-03-10T14:30:00+00:00", "feat: हिन्दी सपोर्ट जोड़ा 🎉", "émoji ünicode — 日本語\n"]);
    const commits = parseGitLog(raw);
    assert.equal(commits.length, 1);
    assert.equal(commits[0].subject, "feat: हिन्दी सपोर्ट जोड़ा 🎉");
    assert.equal(commits[0].body, "émoji ünicode — 日本語");
    assert.equal(commits[0].author, "Ujjwal Dadhich");
});

test("parseGitLog skips malformed records instead of throwing", () => {
    const raw = [
        `garbage without separators${RS}`,
        record(["not-a-hash", "Dev", "d@e.com", "2026-03-10T14:30:00+00:00", "feat: bogus", ""]),
        record([HASH_A, "Dev", "d@e.com", "2026-03-10T14:30:00+00:00", "feat: ok", ""]),
        record([HASH_B, "Dev"]),
    ].join("\n");
    const commits = parseGitLog(raw);
    assert.equal(commits.length, 1);
    assert.equal(commits[0].subject, "feat: ok");
});

test("filterByAuthor matches name or email, case-insensitively", () => {
    const commits = parseGitLog([
        record([HASH_A, "Ada Lovelace", "ada@example.com", "2026-03-10T14:30:00+00:00", "feat: one", ""]),
        record([HASH_B, "Linus", "linus@kernel.org", "2026-03-10T14:30:00+00:00", "fix: two", ""]),
    ].join("\n"));

    assert.equal(filterByAuthor(commits, "ada").length, 1);
    assert.equal(filterByAuthor(commits, "ADA").length, 1);
    assert.equal(filterByAuthor(commits, "kernel.org").length, 1);
    assert.equal(filterByAuthor(commits, "kernel.org")[0].author, "Linus");
    assert.equal(filterByAuthor(commits, "nobody").length, 0);
    assert.equal(filterByAuthor(commits, null).length, 2);
    assert.equal(filterByAuthor(commits, "").length, 2);
});

test("GIT_PRETTY_FORMAT uses the documented separators", () => {
    assert.equal(GIT_PRETTY_FORMAT, "--pretty=format:%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1e");
});

test("buildLogArgs builds the expected git invocation", () => {
    assert.deepEqual(buildLogArgs({ count: 30 }), ["log", "-n", "30", GIT_PRETTY_FORMAT]);
    assert.deepEqual(buildLogArgs(), ["log", "-n", "50", GIT_PRETTY_FORMAT]);
    assert.deepEqual(buildLogArgs({ count: 5, author: "ada" }), ["log", "-i", "--author=ada", "-n", "5", GIT_PRETTY_FORMAT]);
});

test("buildLogArgs escapes regex metacharacters in the author filter", () => {
    const args = buildLogArgs({ count: 5, author: "a.b+c(d)" });
    assert.ok(args.includes("--author=a\\.b\\+c\\(d\\)"));
});

test("normalizeCount coerces junk to the default and clamps", () => {
    assert.equal(normalizeCount(30), 30);
    assert.equal(normalizeCount("30"), 30);
    assert.equal(normalizeCount("12.9"), 12);
    assert.equal(normalizeCount(0), 50);
    assert.equal(normalizeCount(-4), 50);
    assert.equal(normalizeCount("abc"), 50);
    assert.equal(normalizeCount(undefined), 50);
    assert.equal(normalizeCount(10 ** 9), 100000);
});
