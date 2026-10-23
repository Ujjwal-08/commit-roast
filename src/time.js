const ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Read the author's *local* wall clock out of a strict ISO-8601 stamp
 * (git's %aI). The offset in the stamp is the author's own offset, so the
 * date and time parts are already local to them and must not be re-shifted
 * into the machine's timezone.
 */
export function localParts(iso) {
    if (typeof iso !== "string") return null;
    const m = ISO.exec(iso.trim());
    if (!m) return null;
    const [, year, month, day, hour, minute, second] = m;
    const asUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    if (Number.isNaN(asUtc)) return null;
    const weekday = new Date(asUtc).getUTCDay();
    return {
        year: Number(year),
        month: Number(month),
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
        second: Number(second),
        weekday,
        weekdayName: DAYS[weekday],
    };
}

export function isLateNight(iso) {
    const parts = localParts(iso);
    if (!parts) return false;
    return parts.hour >= 0 && parts.hour < 5;
}

export function isWeekend(iso) {
    const parts = localParts(iso);
    if (!parts) return false;
    return parts.weekday === 0 || parts.weekday === 6;
}

export { DAYS as weekdayNames };
