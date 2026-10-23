import test from "node:test";
import assert from "node:assert/strict";
import { parseGitLog, roastCommits, formatReport, formatJson, createColors, supportsColor } from "../index.js";

const US = "\u001F";
const RS = "\u001E";
const ESC = "\u001B";

const SUBJECTS = [
    ["feat(auth): add refresh token rotation", "2026-03-10T14:30:00+00:00"],
    ["fix", "2026-03-10T15:02:00+00:00"],
    ["fix", "2026-03-10T15:40:00+00:00"],
    ["wip", "2026-03-11T09:12:00+00:00"],
    ["stuff", "2026-03-11T10:00:00+00:00"],
    ["FIX THE BUILD ALREADY", "2026-03-11T23:50:00+00:00"],
    ["ugh why is the pipeline red??", "2026-03-12T02:05:00+00:00"],
    ["final", "2026-03-12T03:40:00+00:00"],
    ["final2", "2026-03-12T04:20:00+00:00"],
    ["really final fix", "2026-03-12T11:00:00+00:00"],
    ['Revert "feat(auth): add refresh token rotation"', "2026-03-13T13:00:00+00:00"],
    ['Revert "Revert "feat(auth): add refresh token rotation""', "2026-03-13T13:20:00+00:00"],
    ["fix typo in the readme", "2026-03-13T16:30:00+00:00"],
    ["Merge branch 'release/1.2' into main", "2026-03-14T12:00:00+00:00"],
    ["🎉🚀", "2026-03-14T14:00:00+00:00"],
    ["Merge branch 'main' into feature/login", "2026-03-15T10:00:00+00:00"],
    ["Merge branch 'main' into feature/signup", "2026-03-15T10:30:00+00:00"],
    ["Merge pull request #42 from dev/hotfix", "2026-03-15T11:00:00+00:00"],
    [`chore: ${"renaming things that did not need renaming ".repeat(2)}`, "2026-03-16T09:00:00+00:00"],
    ["docs: write down the deployment steps", "2026-03-16T10:15:00+00:00"],
];

function fakeLog() {
    return SUBJECTS.map(([subject, date], i) => {
        const hash = (i + 1).toString(16).repeat(8).padEnd(40, "0").slice(0, 40);
        const body = i === 0 ? "rotate tokens on every refresh\n\nkeeps sessions short" : "";
        return [hash, "Dev Eloper", "dev@example.com", date, subject, body].join(US) + RS;
    }).join("\n");
}

function pipeline() {
    const commits = parseGitLog(fakeLog());
    return { commits, result: roastCommits(commits, { repo: "fixture-repo" }) };
}

test("the full pipeline turns raw git output into a scored report", () => {
    const { commits, result } = pipeline();
    assert.equal(commits.length, 20);
    assert.equal(result.analyzed, 20);
    assert.equal(result.repo, "fixture-repo");
    assert.ok(result.findings.length >= 10, `expected 10+ findings, got ${result.findings.length}`);
    assert.ok(result.score >= 0 && result.score <= 100);
    assert.ok(result.score < 60, `a history this bad should not score ${result.score}`);
    assert.ok("SABCDF".includes(result.grade));
    assert.equal(result.worst.short.length, 7);
});

test("formatReport contains the repo, the commit count and every roast line", () => {
    const { result } = pipeline();
    const report = formatReport(result, { color: false });
    assert.ok(report.includes("commit-roast"));
    assert.ok(report.includes("fixture-repo"));
    assert.ok(report.includes("20 commits analysed"));
    assert.ok(report.includes(`${result.score}/100`));
    assert.ok(report.includes(`grade ${result.grade}`));
    assert.ok(report.includes(result.verdict));
    assert.ok(report.includes(`worst commit: ${result.worst.short}`));
    for (const finding of result.findings) {
        assert.ok(report.includes(finding.roast), `report is missing the ${finding.id} line`);
        assert.ok(report.includes(String(finding.count)));
    }
});

test("formatReport emits no escape characters when colour is off", () => {
    const { result } = pipeline();
    assert.ok(!formatReport(result, { color: false }).includes(ESC));
    assert.ok(!formatReport(result).includes(ESC), "colour must default to off");
    assert.ok(formatReport(result, { color: true }).includes(ESC));
});

test("formatReport handles a clean history and a single commit", () => {
    const commits = parseGitLog(["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "Dev", "dev@example.com", "2026-03-10T14:30:00+00:00", "feat(core): add the thing properly", ""].join(US) + RS);
    const report = formatReport(roastCommits(commits, { repo: "tidy" }), { color: false });
    assert.ok(report.includes("1 commit analysed"));
    assert.ok(report.includes("nothing to roast"));
    assert.ok(report.includes("100/100"));
    assert.ok(report.includes("grade S"));
});

test("formatJson matches the documented shape", () => {
    const { result } = pipeline();
    const parsed = JSON.parse(formatJson(result));
    assert.equal(parsed.repo, "fixture-repo");
    assert.equal(parsed.analyzed, 20);
    assert.equal(parsed.score, result.score);
    assert.equal(parsed.grade, result.grade);
    assert.equal(parsed.verdict, result.verdict);
    assert.ok(Array.isArray(parsed.findings));
    assert.equal(parsed.findings.length, result.findings.length);
    for (const finding of parsed.findings) {
        assert.equal(typeof finding.id, "string");
        assert.equal(typeof finding.count, "number");
        assert.equal(typeof finding.roast, "string");
        assert.ok(Array.isArray(finding.samples));
        assert.ok(finding.samples.every((sample) => typeof sample === "string"));
    }
    assert.ok(!formatJson(result).includes(ESC));
});

test("the pipeline is deterministic end to end", () => {
    const first = formatReport(pipeline().result, { color: false });
    const second = formatReport(pipeline().result, { color: false });
    assert.equal(first, second);
});

test("createColors is the identity when disabled", () => {
    const off = createColors(false);
    assert.equal(off.red("hi"), "hi");
    assert.equal(off.bold("hi"), "hi");
    assert.equal(off.enabled, false);

    const on = createColors(true);
    assert.equal(on.red("hi"), "\u001B[31mhi\u001B[39m");
    assert.equal(on.enabled, true);
});

test("supportsColor honours NO_COLOR, FORCE_COLOR and TTY state", () => {
    assert.equal(supportsColor({ NO_COLOR: "1" }, { isTTY: true }), false);
    assert.equal(supportsColor({}, { isTTY: false }), false);
    assert.equal(supportsColor({}, { isTTY: true }), true);
    assert.equal(supportsColor({ TERM: "dumb" }, { isTTY: true }), false);
    assert.equal(supportsColor({ FORCE_COLOR: "1", NO_COLOR: "1" }, { isTTY: false }), true);
    assert.equal(supportsColor({}, undefined), false);
});
