const CODES = {
    reset: [0, 0],
    bold: [1, 22],
    dim: [2, 22],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    gray: [90, 39],
};

const NAMES = Object.keys(CODES);

/**
 * Decide whether ANSI colour should be used. NO_COLOR (any value) and a
 * non-TTY stdout both disable it; FORCE_COLOR overrides both.
 */
export function supportsColor(env = process.env, stream = process.stdout) {
    if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "" && env.FORCE_COLOR !== "0") {
        return true;
    }
    if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
    if (env.TERM === "dumb") return false;
    return Boolean(stream && stream.isTTY);
}

/**
 * Build a palette. When `enabled` is false every function is the identity,
 * so the exact same code path produces plain text.
 */
export function createColors(enabled = supportsColor()) {
    const palette = {};
    for (const name of NAMES) {
        if (enabled) {
            const [open, close] = CODES[name];
            palette[name] = (text) => `\u001B[${open}m${text}\u001B[${close}m`;
        } else {
            palette[name] = (text) => String(text);
        }
    }
    palette.enabled = enabled;
    return palette;
}

export const colorNames = NAMES;
