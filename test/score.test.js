import test from "node:test";
import assert from "node:assert/strict";
import { roastCommits, penaltyFor, gradeFor } from "../index.js";

const WEEKDAY_AFTERNOON = "2026-03-10T14:30:00+00:00";

let counter = 0;

function commit(subject, overrides = {}) {
    counter += 1;
    const hash = counter.toString(16).padStart(40, "5");
    return {
        hash,
        short: hash.slice(0, 7),
        author: "Dev Eloper",
        email: "dev@example.com",
        date: WEEKDAY_AFTERNOON,
        subject,
        body: "",
        message: subject,
        ...overrides,
    };
}

function clean() {
    return [
        "feat(auth): add refresh token rotation",
        "fix(api): guard against null session ids",
        "docs: describe the caching strategy",
        "refactor(db): extract query builder helpers",
        "perf(list): memoise the row renderer",
        "test(parser): cover multi-line bodies",
    ].map((subject) => commit(subject));
}

function messy() {
    return [
        commit("fix"),
        commit("fix"),
        commit("wip"),
        commit("stuff"),
        commit("FIX IT ALREADY"),
        commit("final2", { date: "2026-03-14T02:10:00+00:00" }),
        commit("ugh why does this break!!"),
        commit('Revert "Revert "add the thing""'),
        commit("typo"),
        commit("asdf"),
    ];
}

test("a clean history scores 100 with no findings", () => {
    const result = roastCommits(clean(), { repo: "tidy" });
    assert.equal(result.score, 100);
    assert.equal(result.grade, "S");
    assert.equal(result.analyzed, 6);
    assert.equal(result.repo, "tidy");
    assert.deepEqual(result.findings, []);
    assert.equal(typeof result.verdict, "string");
    assert.ok(result.verdict.length > 0);
});

test("a messy history scores far lower than a clean one", () => {
    const dirty = roastCommits(messy());
    const tidy = roastCommits(clean());
    assert.ok(dirty.score < tidy.score, `${dirty.score} should be below ${tidy.score}`);
    assert.ok(dirty.findings.length >= 8, `expected 8+ findings, got ${dirty.findings.length}`);
    assert.equal(dirty.repo, null);
});

test("the score is deterministic for the same input", () => {
    const a = roastCommits(messy());
    const b = roastCommits(messy());
    assert.equal(a.score, b.score);
    assert.equal(a.grade, b.grade);
    assert.deepEqual(a.findings.map((f) => f.id), b.findings.map((f) => f.id));
    assert.deepEqual(a.findings.map((f) => f.roast), b.findings.map((f) => f.roast));
});

test("the score is always clamped to 0..100", () => {
    const disaster = Array.from({ length: 40 }, () => commit("fix!!", { date: "2026-03-14T03:00:00+00:00" }));
    const result = roastCommits(disaster);
    assert.ok(result.score >= 0 && result.score <= 100);
    assert.ok(result.score < 40, `expected a failing score, got ${result.score}`);
    assert.equal(result.grade, "F");

    const brutal = [1, 2, 3].map((n) => ({
        id: `brutal-${n}`,
        title: "brutal",
        weight: 80,
        test: (commits) => commits,
        roast: (matches) => `${matches.length} commits, every one a mistake`,
    }));
    assert.equal(roastCommits(clean(), { rules: brutal }).score, 0);

    assert.equal(roastCommits([]).score, 100);
    assert.equal(roastCommits([]).analyzed, 0);
    assert.equal(roastCommits(null).analyzed, 0);
});

test("findings are sorted by penalty, most severe first", () => {
    const result = roastCommits(messy());
    const penalties = result.findings.map((f) => f.penalty);
    const sorted = [...penalties].sort((a, b) => b - a);
    assert.deepEqual(penalties, sorted);
    for (const finding of result.findings) {
        assert.ok(finding.count > 0);
        assert.ok(finding.penalty > 0);
        assert.ok(finding.samples.length > 0 && finding.samples.length <= 3);
        assert.ok(finding.roast.includes(String(finding.count)));
    }
});

test("penaltyFor is proportional and capped at the rule weight", () => {
    assert.equal(penaltyFor(10, 0, 10), 0);
    assert.equal(penaltyFor(10, 1, 10), 2);
    assert.equal(penaltyFor(10, 5, 10), 10);
    assert.equal(penaltyFor(10, 10, 10), 10);
    assert.equal(penaltyFor(10, 5, 0), 0);
});

test("gradeFor covers every band from S to F", () => {
    assert.equal(gradeFor(100).grade, "S");
    assert.equal(gradeFor(95).grade, "S");
    assert.equal(gradeFor(90).grade, "A");
    assert.equal(gradeFor(75).grade, "B");
    assert.equal(gradeFor(60).grade, "C");
    assert.equal(gradeFor(45).grade, "D");
    assert.equal(gradeFor(0).grade, "F");
    for (const score of [0, 25, 50, 75, 100]) {
        assert.ok(gradeFor(score).verdict.length > 10);
    }
});

test("the worst commit is the one the most rules hit", () => {
    const commits = [
        commit("feat(core): add a perfectly reasonable subject line"),
        commit("fix!!", { date: "2026-03-14T02:00:00+00:00" }),
        commit("docs: explain the cache invalidation rules"),
    ];
    const result = roastCommits(commits);
    assert.equal(result.worst.subject, "fix!!");
    assert.ok(result.worst.weight > 0);
    assert.equal(result.worst.short.length, 7);
    assert.equal(roastCommits([]).worst, null);
});

test("a custom rule set can replace the built-in rules", () => {
    const rule = {
        id: "always",
        title: "always",
        weight: 50,
        test: (commits) => commits,
        roast: (matches) => `${matches.length} commits, all of them suspicious`,
    };
    const result = roastCommits(clean(), { rules: [rule] });
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, "always");
    assert.equal(result.score, 50);
});
