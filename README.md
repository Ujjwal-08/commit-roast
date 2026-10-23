# commit-roast

Reads your git history and prints a funny but accurate roast of your commit messages, plus a 0-100 commit hygiene score. Entirely offline and rule-based — no AI, no network, no writes.

```
──────────────────────────────────────────────────────────────
 commit-roast · hindicode · 22 commits analysed
──────────────────────────────────────────────────────────────
 ✖ 12 of 22 commits were authored on a Saturday or Sunday — the weekend called, you pushed it to a branch.
 ✖ 4 subjects run past 72 characters (worst: 109) — that is not a subject, that is the body wearing a subject's coat.
 ✖ 1 message is used more than once across 3 commits — "update readme.md" alone appears 3 times. Ctrl+C, Ctrl+V, ship.
 ✖ 1 of 22 commits is a placeholder like "Initial commit" — 5% of your history is a shrug with a hash.
 ✖ 1 of 22 commits leaks frustration — someone committed the word "finally" to the permanent record. The history reads like a diary with a build step.
──────────────────────────────────────────────────────────────
 score 85/100 [█████████████████░░░] grade A
 verdict: Solid history. A reviewer could follow this without a map.
 worst commit: b6d9cc8 "Initial commit"
──────────────────────────────────────────────────────────────
```

Every number in that report is counted from the actual log. Rules that find nothing stay silent.

## Install

```sh
npx commit-roast
```

```sh
npm i commit-roast
```

## Usage

Run it inside any git repository:

```sh
commit-roast                  # the 50 most recent commits
commit-roast -n 200           # a longer window
commit-roast -a ada           # only commits by an author matching "ada"
commit-roast --json           # machine-readable output
```

| Flag | Description |
| --- | --- |
| `-n, --count <n>` | How many recent commits to analyse. Default `50`. |
| `-a, --author <s>` | Only commits whose author name or email contains `<s>` (case-insensitive). |
| `--all` | All authors. This is the default. |
| `--json` | Print JSON instead of the report card. |
| `--no-color` | Disable ANSI colour. Colour is also off when `NO_COLOR` is set or stdout is not a TTY. |
| `-h, --help` | Show help. |
| `-v, --version` | Print the version. |

`commit-roast --help`:

```
commit-roast — a funny but accurate roast of your git commit messages.

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
No network calls, no AI, no writes.
```

Outside a repository it exits with code `1`:

```
commit-roast: not a git repository — run this inside one
```

`commit-roast -n 8 --json`:

```json
{
  "repo": "hindicode",
  "analyzed": 8,
  "score": 98,
  "grade": "S",
  "verdict": "Immaculate. Someone here reads their own git log.",
  "worst": {
    "hash": "1f4703380cbaaa08ab70a992d852ab763b4cf711",
    "short": "1f47033",
    "subject": "feat: keep keywords Hindi as object keys and property names",
    "weight": 8
  },
  "findings": [
    {
      "id": "frustration",
      "count": 1,
      "roast": "1 of 8 commits leaks frustration — someone committed the word \"finally\" to the permanent record. The history reads like a diary with a build step.",
      "samples": [
        "1f47033 feat: keep keywords Hindi as object keys and property names"
      ],
      "penalty": 2
    }
  ]
}
```

### As a library

```js
import { readCommits, roastCommits, formatReport } from "commit-roast";

const { repo, commits } = await readCommits({ count: 100 });
const result = roastCommits(commits, { repo });

console.log(formatReport(result, { color: true }));
console.log(result.score, result.grade);
```

Everything except `readCommits` is pure, so you can score commits from any source:

```js
import { parseGitLog, roastCommits } from "commit-roast";

const commits = parseGitLog(rawGitLogOutput);
const { score, grade, findings } = roastCommits(commits);
```

## API

### `readCommits(options?) => Promise<{ repo, root, commits }>`

Impure. Runs `git log` in `options.cwd` (default `process.cwd()`) and returns parsed commits.
Options: `cwd`, `count` (default `50`), `author`. Rejects with a `GitError` carrying a `code` of
`GIT_MISSING`, `NOT_A_REPO`, `NO_COMMITS` or `GIT_FAILED`.

### `parseGitLog(raw) => Commit[]`

Pure. Parses the unit/record separated output of
`git log --pretty=format:%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1e` into
`{ hash, short, author, email, date, subject, body, message }` objects. Multi-line bodies, CRLF,
unicode and empty input are all handled; malformed records are skipped rather than thrown on.

### `roastCommits(commits, options?) => RoastResult`

Pure. Runs every rule and returns `{ repo, analyzed, score, grade, verdict, worst, findings }`.
`findings` are sorted most severe first; each is `{ id, title, count, weight, penalty, roast, samples }`.
Options: `repo` (name for the header) and `rules` (replace the built-in rule set).
The same commits always produce the same score.

### `formatReport(result, options?) => string`

Pure. Renders the terminal card. `{ color: true }` adds ANSI colour; the default is plain text.

### `formatJson(result) => string`

Pure. Renders the result as indented JSON — what `--json` prints.

### `filterByAuthor(commits, needle) => Commit[]`

Pure. Keeps commits whose author name or email contains `needle`, case-insensitively.

### Scoring helpers

`penaltyFor(weight, matched, total)` is the per-rule penalty: proportional to the share of the
window matched, capped at the rule's weight. `gradeFor(score)` maps 0-100 onto `S`/`A`/`B`/`C`/`D`/`F`
and its verdict. A score starts at 100 and every firing rule subtracts its penalty, clamped to 0-100.

### Rules

`rules`, `ruleIds` and `getRule(id)` expose the 15 built-in rules, each
`{ id, title, weight, test(commits), roast(matches, commits) }`:

`lazy-messages`, `short-subjects`, `long-subjects`, `shouting`, `frustration`, `final-family`,
`duplicate-messages`, `no-conventional`, `emoji-heavy`, `late-night`, `weekend-warrior`,
`punctuation-screaming`, `revert-spiral`, `typo-patrol`, `merge-flood`.

Write your own rule with the same shape and pass it through `roastCommits(commits, { rules })`.

## Why

Commit messages are the only documentation that is guaranteed to still exist in two years, and
most of them say "fix". This counts exactly how often that happens in your repo and gives you a
single number to argue about in standup. It reads the log and nothing else — no files are written,
nothing leaves the machine, and there is no model deciding what is funny.

## Support

If this saved you some time, you can support the work here:

- **Patreon:** https://www.patreon.com/cw/BABU_ISHU
- **PayPal:** https://www.paypal.com/ncp/payment/SECBQ62TRZZ6Y

## License

MIT
