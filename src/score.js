import { rules as defaultRules } from "./rules.js";

const GRADES = [
    { grade: "S", min: 95, verdict: "Immaculate. Someone here reads their own git log." },
    { grade: "A", min: 85, verdict: "Solid history. A reviewer could follow this without a map." },
    { grade: "B", min: 70, verdict: "Mostly readable, with the occasional cry for help." },
    { grade: "C", min: 55, verdict: "Legible to you, today. Not to anyone else, ever." },
    { grade: "D", min: 40, verdict: "This log is a crime scene with timestamps." },
    { grade: "F", min: 0, verdict: "git blame returns a shrug and a 404 on meaning." },
];

const MAX_SAMPLES = 3;

export function gradeFor(score) {
    return GRADES.find((entry) => score >= entry.min) ?? GRADES[GRADES.length - 1];
}

/**
 * Penalty for one rule: proportional to how much of the window it matched,
 * capped at the rule's weight. Half the commits matching costs full weight.
 */
export function penaltyFor(weight, matched, total) {
    if (!total || matched <= 0) return 0;
    const ratio = matched / total;
    return Math.min(weight, Math.round(weight * ratio * 2));
}

function sampleOf(commit) {
    return `${commit.short} ${commit.subject}`;
}

function pickWorst(commits, findings) {
    if (commits.length === 0) return null;
    const scores = new Map();
    for (const finding of findings) {
        for (const commit of finding.matches) {
            scores.set(commit.hash, (scores.get(commit.hash) ?? 0) + finding.weight);
        }
    }
    let worst = commits[0];
    let worstScore = scores.get(worst.hash) ?? 0;
    for (const commit of commits) {
        const value = scores.get(commit.hash) ?? 0;
        if (value > worstScore) {
            worst = commit;
            worstScore = value;
        }
    }
    return { hash: worst.hash, short: worst.short, subject: worst.subject, weight: worstScore };
}

/**
 * Pure: run every rule over parsed commits and produce the full result.
 * The same commits always produce the same score, grade and ordering.
 */
export function roastCommits(commits, options = {}) {
    const list = Array.isArray(commits) ? commits : [];
    const activeRules = options.rules ?? defaultRules;
    const repo = options.repo ?? null;
    const findings = [];

    for (const rule of activeRules) {
        const matches = list.length > 0 ? rule.test(list) ?? [] : [];
        if (matches.length === 0) continue;
        findings.push({
            id: rule.id,
            title: rule.title,
            count: matches.length,
            weight: rule.weight,
            penalty: penaltyFor(rule.weight, matches.length, list.length),
            roast: rule.roast(matches, list),
            samples: matches.slice(0, MAX_SAMPLES).map(sampleOf),
            matches,
        });
    }

    findings.sort((a, b) => (b.penalty - a.penalty) || (b.count - a.count) || a.id.localeCompare(b.id));

    const totalPenalty = findings.reduce((sum, finding) => sum + finding.penalty, 0);
    const score = Math.max(0, Math.min(100, 100 - totalPenalty));
    const { grade, verdict } = gradeFor(score);

    return {
        repo,
        analyzed: list.length,
        score,
        grade,
        verdict,
        worst: pickWorst(list, findings),
        findings: findings.map(({ matches, ...finding }) => finding),
    };
}
