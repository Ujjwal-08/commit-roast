import test from "node:test";
import assert from "node:assert/strict";
import { rules, ruleIds, getRule, isLazySubject, isConventional, isShouting } from "../index.js";

const WEEKDAY_AFTERNOON = "2026-03-10T14:30:00+00:00"; // Tuesday
const LATE_NIGHT = "2026-03-10T02:15:00+00:00";
const SATURDAY = "2026-03-14T11:00:00+00:00";
const SUNDAY = "2026-03-15T16:45:00+00:00";

let counter = 0;

function commit(subject, overrides = {}) {
    counter += 1;
    const hash = counter.toString(16).padStart(40, "c");
    const body = overrides.body ?? "";
    return {
        hash,
        short: hash.slice(0, 7),
        author: "Dev Eloper",
        email: "dev@example.com",
        date: WEEKDAY_AFTERNOON,
        subject,
        body,
        message: body ? `${subject}\n\n${body}` : subject,
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

function fires(id, commits) {
    return getRule(id).test(commits);
}

test("the rule set has at least 12 rules with unique ids and positive weights", () => {
    assert.ok(rules.length >= 12, `expected 12+ rules, got ${rules.length}`);
    assert.equal(new Set(ruleIds).size, ruleIds.length);
    for (const rule of rules) {
        assert.equal(typeof rule.id, "string");
        assert.equal(typeof rule.test, "function");
        assert.equal(typeof rule.roast, "function");
        assert.ok(rule.weight > 0);
    }
});

test("no rule fires on a clean, conventional history", () => {
    const commits = clean();
    for (const rule of rules) {
        assert.deepEqual(rule.test(commits), [], `${rule.id} produced a false positive`);
    }
});

test("every roast line reports the real number of matches", () => {
    const commits = [
        commit("fix"),
        commit("fix"),
        commit("WIP ON THE THING"),
        commit("ugh why", { date: LATE_NIGHT }),
        commit("final2", { date: SATURDAY }),
        commit("Revert \"Revert \"feat: add thing\"\""),
        commit("fix typo!!"),
        commit("🎉🚀"),
        commit("Merge branch 'main'"),
        commit("Merge branch 'dev'"),
        commit("Merge pull request #9"),
        commit(`chore: ${"x".repeat(90)}`),
    ];
    let fired = 0;
    for (const rule of rules) {
        const matches = rule.test(commits);
        if (matches.length === 0) continue;
        fired += 1;
        const line = rule.roast(matches, commits);
        assert.equal(typeof line, "string");
        assert.ok(line.length > 20, `${rule.id} roast is too short`);
        assert.ok(line.includes(String(matches.length)), `${rule.id} roast omits its count: ${line}`);
    }
    assert.ok(fired >= 12, `expected 12+ rules to fire on the messy fixture, got ${fired}`);
});

test("lazy-messages: fires on placeholders, not on real subjects", () => {
    const messy = [commit("fix"), commit("WIP"), commit("update"), commit("stuff"), commit("..."), commit("asdf")];
    assert.equal(fires("lazy-messages", messy).length, 6);
    assert.equal(fires("lazy-messages", clean()).length, 0);
    assert.ok(isLazySubject("Fix."));
    assert.ok(isLazySubject("  wip  "));
    assert.ok(!isLazySubject("fix: null session ids"));
    assert.ok(!isLazySubject(""));
});

test("short-subjects: fires under 10 characters only", () => {
    const messy = [commit("tiny fix"), commit("nope"), commit("ok then!")];
    assert.equal(fires("short-subjects", messy).length, 3);
    assert.equal(fires("short-subjects", [commit("fix: ten++")]).length, 0);
    assert.equal(fires("short-subjects", clean()).length, 0);
});

test("long-subjects: fires past 72 characters only", () => {
    const long = commit(`chore: ${"x".repeat(80)}`);
    const borderline = commit("c".repeat(72));
    assert.equal(fires("long-subjects", [long]).length, 1);
    assert.equal(fires("long-subjects", [borderline]).length, 0);
    assert.equal(fires("long-subjects", clean()).length, 0);
});

test("shouting: fires on ALL CAPS, not on acronyms inside normal text", () => {
    const messy = [commit("FIX THE LOGIN BUTTON"), commit("DO NOT DEPLOY")];
    assert.equal(fires("shouting", messy).length, 2);
    assert.equal(fires("shouting", [commit("fix: API returns 500"), commit("feat: add CI")]).length, 0);
    assert.equal(fires("shouting", clean()).length, 0);
    assert.ok(isShouting("WHY IS THIS BROKEN"));
    assert.ok(!isShouting("ABC"));
    assert.ok(!isShouting("1234 5678"));
});

test("frustration: fires on frustrated wording in subject or body", () => {
    const messy = [
        commit("why does this even work"),
        commit("ugh, green at last"),
        commit("chore: cleanup", { body: "wtf was that race condition" }),
    ];
    assert.equal(fires("frustration", messy).length, 3);
    assert.equal(fires("frustration", clean()).length, 0);
});

test("final-family: fires on final/final2/last fix, not on 'finalize'", () => {
    const messy = [commit("final"), commit("final2"), commit("really final fix"), commit("last fix for real this time")];
    assert.equal(fires("final-family", messy).length, 4);
    assert.equal(fires("final-family", [commit("feat: finalize onboarding copy")]).length, 0);
    assert.equal(fires("final-family", clean()).length, 0);
});

test("duplicate-messages: fires only on repeats", () => {
    const messy = [commit("fix: typo"), commit("fix: typo"), commit("FIX: TYPO"), commit("feat: add the thing")];
    const matches = fires("duplicate-messages", messy);
    assert.equal(matches.length, 3);
    assert.ok(getRule("duplicate-messages").roast(matches, messy).includes("3 times"));
    assert.equal(fires("duplicate-messages", clean()).length, 0);
});

test("no-conventional: fires when most commits skip the prefix", () => {
    const none = [commit("add login"), commit("remove dead code"), commit("bump deps"), commit("tidy styles")];
    assert.equal(fires("no-conventional", none).length, 4);
    assert.ok(getRule("no-conventional").roast(none, none).startsWith("0 of 4"));

    const few = [commit("feat: add login"), commit("remove dead code"), commit("bump deps"), commit("tidy styles")];
    assert.equal(fires("no-conventional", few).length, 3);

    const mostly = [commit("feat: add login"), commit("fix: crash on boot"), commit("docs: add readme notes"), commit("tidy styles")];
    assert.equal(fires("no-conventional", mostly).length, 0);
    assert.equal(fires("no-conventional", clean()).length, 0);
    assert.ok(isConventional("feat(scope)!: breaking change"));
    assert.ok(!isConventional("feature: not quite"));
});

test("emoji-heavy: fires on emoji piles, not on a single decorative emoji", () => {
    const messy = [commit("🎉🚀 ship it"), commit("🔥")];
    assert.equal(fires("emoji-heavy", messy).length, 2);
    assert.equal(fires("emoji-heavy", [commit("feat: ship the thing 🎉")]).length, 0);
    assert.equal(fires("emoji-heavy", clean()).length, 0);
});

test("late-night: fires between 00:00 and 05:00 author-local", () => {
    const messy = [
        commit("fix: the thing", { date: "2026-03-10T00:05:00+00:00" }),
        commit("fix: other thing", { date: "2026-03-10T04:59:00-07:00" }),
    ];
    assert.equal(fires("late-night", messy).length, 2);
    assert.equal(fires("late-night", [commit("x", { date: "2026-03-10T05:00:00+00:00" })]).length, 0);
    assert.equal(fires("late-night", clean()).length, 0);
});

test("late-night uses the author's own offset, not the machine timezone", () => {
    // 23:30 in a +05:30 zone is the previous evening locally, never 2am.
    assert.equal(fires("late-night", [commit("x", { date: "2026-03-10T23:30:00+05:30" })]).length, 0);
    assert.equal(fires("late-night", [commit("x", { date: "2026-03-10T03:30:00+05:30" })]).length, 1);
});

test("weekend-warrior: fires on Saturday and Sunday only", () => {
    const messy = [commit("fix: saturday", { date: SATURDAY }), commit("fix: sunday", { date: SUNDAY })];
    assert.equal(fires("weekend-warrior", messy).length, 2);
    assert.equal(fires("weekend-warrior", clean()).length, 0);
});

test("punctuation-screaming: fires on !! and ?? endings only", () => {
    const messy = [commit("it works!!!"), commit("why is this broken??")];
    assert.equal(fires("punctuation-screaming", messy).length, 2);
    assert.equal(fires("punctuation-screaming", [commit("fix: escape the ! character"), commit("docs: what now?")]).length, 0);
    assert.equal(fires("punctuation-screaming", clean()).length, 0);
});

test("revert-spiral: fires on reverts and calls out reverted reverts", () => {
    const messy = [commit('Revert "feat: add thing"'), commit('Revert "Revert "feat: add thing""')];
    const matches = fires("revert-spiral", messy);
    assert.equal(matches.length, 2);
    assert.ok(getRule("revert-spiral").roast(matches, messy).includes("1 of them revert a revert"));
    assert.equal(fires("revert-spiral", clean()).length, 0);
});

test("typo-patrol: fires on typo commits only", () => {
    const messy = [commit("fix typo in readme"), commit("more typos")];
    assert.equal(fires("typo-patrol", messy).length, 2);
    assert.equal(fires("typo-patrol", clean()).length, 0);
});

test("merge-flood: needs three merges and a fifth of the window", () => {
    const flood = [
        commit("Merge branch 'main'"),
        commit("Merge branch 'dev'"),
        commit("Merge pull request #12"),
        commit("feat: add the thing"),
    ];
    assert.equal(fires("merge-flood", flood).length, 3);

    const twoMerges = [commit("Merge branch 'main'"), commit("Merge branch 'dev'"), ...clean()];
    assert.equal(fires("merge-flood", twoMerges).length, 0);

    const diluted = [
        commit("Merge branch 'a'"),
        commit("Merge branch 'b'"),
        commit("Merge branch 'c'"),
        ...Array.from({ length: 20 }, (_, i) => commit(`feat: add feature number ${i}`)),
    ];
    assert.equal(fires("merge-flood", diluted).length, 0);
    assert.equal(fires("merge-flood", clean()).length, 0);
});
