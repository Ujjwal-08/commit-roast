const UNIT = "\u001F";
const RECORD = "\u001E";

export const FIELD_SEPARATOR = UNIT;
export const RECORD_SEPARATOR = RECORD;

// %x1f / %x1e make git emit the unit and record separators itself, so no raw
// control characters have to survive the argv round-trip on any platform.
export const GIT_PRETTY_FORMAT = "--pretty=format:%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1e";

function normalizeNewlines(value) {
    return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Parse the raw output of
 *   git log --pretty=format:%H\x1f%an\x1f%ae\x1f%aI\x1f%s\x1f%b\x1e
 * into commit objects. Multi-line bodies are safe because fields are split
 * on the unit separator and records on the record separator, never on \n.
 */
export function parseGitLog(raw) {
    if (typeof raw !== "string" || raw.length === 0) return [];
    const commits = [];
    for (const chunk of raw.split(RECORD)) {
        const record = normalizeNewlines(chunk).replace(/^\n+/, "");
        if (record.trim() === "") continue;
        const fields = record.split(UNIT);
        if (fields.length < 5) continue;
        const [hash, author, email, date, subject] = fields;
        if (!hash || !/^[0-9a-f]{7,64}$/i.test(hash.trim())) continue;
        const body = (fields[5] ?? "").replace(/\n+$/, "");
        const cleanHash = hash.trim();
        const cleanSubject = subject.trim();
        commits.push({
            hash: cleanHash,
            short: cleanHash.slice(0, 7),
            author: author.trim(),
            email: email.trim(),
            date: date.trim(),
            subject: cleanSubject,
            body,
            message: body ? `${cleanSubject}\n\n${body}` : cleanSubject,
        });
    }
    return commits;
}

/**
 * Keep only commits whose author name or email contains `needle`
 * (case-insensitive substring). An empty needle keeps everything.
 */
export function filterByAuthor(commits, needle) {
    if (!needle) return commits.slice();
    const wanted = String(needle).toLowerCase();
    return commits.filter((commit) => {
        const name = (commit.author ?? "").toLowerCase();
        const email = (commit.email ?? "").toLowerCase();
        return name.includes(wanted) || email.includes(wanted);
    });
}
