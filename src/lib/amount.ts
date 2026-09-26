// Amount entry + rounding helpers. Money is stored as Postgres `numeric` and
// held in JS as a plain number, so anything that came out of arithmetic is
// snapped to whole cents (round2) before it's compared, shown, or written back
// — otherwise 0.1 + 0.2 would be persisted as 0.30000000000000004.
//
// Amounts being typed are kept as text ("", "12", "12.", "12.5") rather than
// numbers, so an in-progress decimal point isn't lost on every keystroke.

export const MAX_INT_DIGITS = 9;
export const MAX_DECIMALS = 2;

// Snap to whole cents. Also normalises -0 to 0, which would otherwise print as
// "-0" / "-0.00".
export function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

// The number an entry string represents. "" and a bare "." are zero.
export function parseAmount(text: string): number {
  return text === "" || text === "." ? 0 : Number(text);
}

// One keypad press applied to the current entry string. Keys are the digits
// "0"-"9", "." and "back". Enforces: a single decimal point (a leading one
// becomes "0."), at most MAX_DECIMALS decimals, at most MAX_INT_DIGITS whole
// digits, and no leading zeros ("0" then "5" is "5", not "05").
export function applyKey(current: string, key: string): string {
  if (key === "back") return current.slice(0, -1);

  if (key === ".") {
    if (current.includes(".")) return current;
    return current === "" ? "0." : current + ".";
  }

  const dot = current.indexOf(".");
  if (dot === -1) {
    if (current === "0") return key;
    return current.length >= MAX_INT_DIGITS ? current : current + key;
  }
  return current.length - dot - 1 >= MAX_DECIMALS ? current : current + key;
}

// Splits an entry string for display as "Rs 1,250.5" + a dimmed "0": `main`
// is exactly what's been typed (thousands-grouped), `hint` is the untyped
// remainder of the two decimals, so the field always reads as a 2-decimal
// amount without pretending the user typed digits they haven't.
export function entryParts(text: string): { main: string; hint: string } {
  const hasDot = text.includes(".");
  const [intPart = "", fracPart = ""] = text.split(".");
  const grouped = Number(intPart || "0").toLocaleString("en-LK", { maximumFractionDigits: 0 });
  return {
    main: "Rs " + grouped + (hasDot ? "." + fracPart : ""),
    hint: hasDot ? "0".repeat(Math.max(0, MAX_DECIMALS - fracPart.length)) : ".00",
  };
}

// Cleans the text a free-typing <TextInput> reports into a valid entry string
// for `decimals` places (0 = whole numbers only, digits stripped of everything
// else). Same rules as applyKey, but for arbitrary pasted/typed text.
export function sanitizeAmountText(input: string, decimals: number): string {
  if (decimals <= 0) return input.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
  const [whole, ...rest] = input.replace(/[^0-9.]/g, "").split(".");
  const intPart = whole.replace(/^0+(?=\d)/, "");
  if (rest.length === 0) return intPart;
  return `${intPart === "" ? "0" : intPart}.${rest.join("").slice(0, decimals)}`;
}
