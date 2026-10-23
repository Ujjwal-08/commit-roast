import { createColors } from "./colors.js";

const WIDTH = 62;
const BAR_SLOTS = 20;

function rule(char = "─") {
    return char.repeat(WIDTH);
}

function bar(score) {
    const filled = Math.round((score / 100) * BAR_SLOTS);
    return `${"█".repeat(filled)}${"░".repeat(BAR_SLOTS - filled)}`;
}

function tone(colors, score) {
    if (score >= 85) return colors.green;
    if (score >= 55) return colors.yellow;
    return colors.red;
}

/**
 * Pure: turn a roast result into the printable terminal card.
 * With `{ color: false }` the output contains no escape sequences.
 */
export function formatReport(result, options = {}) {
    const enabled = options.color === undefined ? false : Boolean(options.color);
    const colors = createColors(enabled);
    const repo = result.repo ?? "this repo";
    const analyzed = result.analyzed ?? 0;
    const paint = tone(colors, result.score);
    const lines = [];

    lines.push(colors.dim(rule()));
    lines.push(` ${colors.bold("commit-roast")} ${colors.dim("·")} ${colors.cyan(repo)} ${colors.dim("·")} ${analyzed} ${analyzed === 1 ? "commit" : "commits"} analysed`);
    lines.push(colors.dim(rule()));

    if (result.findings.length === 0) {
        lines.push(` ${colors.green("·")} nothing to roast across ${analyzed} ${analyzed === 1 ? "commit" : "commits"} — suspiciously professional.`);
    } else {
        for (const finding of result.findings) {
            lines.push(` ${colors.red("✖")} ${finding.roast}`);
        }
    }

    lines.push(colors.dim(rule()));
    lines.push(` score ${paint(`${result.score}/100`)} ${colors.dim("[")}${paint(bar(result.score))}${colors.dim("]")} grade ${paint(colors.bold(result.grade))}`);
    lines.push(` ${colors.dim("verdict:")} ${result.verdict}`);
    if (result.worst) {
        lines.push(` ${colors.dim("worst commit:")} ${colors.yellow(result.worst.short)} "${result.worst.subject}"`);
    }
    lines.push(colors.dim(rule()));

    return lines.join("\n");
}

export function formatJson(result) {
    return JSON.stringify(
        {
            repo: result.repo,
            analyzed: result.analyzed,
            score: result.score,
            grade: result.grade,
            verdict: result.verdict,
            worst: result.worst,
            findings: result.findings.map((finding) => ({
                id: finding.id,
                count: finding.count,
                roast: finding.roast,
                samples: finding.samples,
                penalty: finding.penalty,
            })),
        },
        null,
        2,
    );
}
