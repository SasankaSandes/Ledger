# Ledger — Functional Requirements Specification

A personal budgeting app that turns salary into tracked, reconciled money — every rupee allocated, spent, saved, borrowed, or carried forward, closed out one salary period at a time.

**Platform:** Web, mobile-first single column
**Auth:** Supabase (email/password, magic link)
**Scope:** Single-household use today

---

## Contents

1. [Purpose & audience](#01-purpose--audience)
2. [Information architecture](#02-information-architecture)
3. [Core domain model](#03-core-domain-model)
4. [Screens](#04-screens)
5. [Business rules & formulas](#05-business-rules--formulas)
6. [Data schema reference](#06-data-schema-reference)
7. [Existing visual language](#07-existing-visual-language)
8. [Explicitly out of scope (today)](#08-explicitly-out-of-scope-today)

---

## 01. Purpose & audience

Ledger answers one question at any moment: *what's happened to this month's money?* A user sets a salary and a salary date, defines what that salary is committed to (fixed bills, capped discretionary budgets, allowances), then spends against that plan for one salary period. Nothing is allowed to go untracked — money that arrives outside salary (a loan, a savings withdrawal) and money that leaves outside the plan (a debt repayment) both flow through the same ledger. Closing a period is a deliberate, manual act that forces every leftover rupee to a decision: carried forward, or set aside in savings.

This document exists so a redesign can start from the actual feature surface rather than screenshots — every field, state, and rule the current build implements, in one place.

---

## 02. Information architecture

Six routes, each server-gated before render. There is no bottom nav or sidebar today — screens link to each other contextually.

| Route | Gate | Purpose |
|---|---|---|
| `/login` | Public | Sign in, create account, or request a magic link |
| `/onboarding` | Authed, not yet onboarded | First-run setup wizard; redirects to `/dashboard` once complete |
| `/dashboard` | Authed & onboarded | The Ledger itself — the current open period |
| `/settings` | Authed & onboarded | "Manage" — edit the household's structure anytime |
| `/savings` | Authed & onboarded | Named savings collections |
| `/debts` | Authed & onboarded | Money owed to others |

> **Note** — a `household_members` / `invites` schema exists for shared households, but no invite-acceptance flow is built. Every signup gets its own solo household today; see §08.

---

## 03. Core domain model

Six concepts, three different persistence lifetimes. Understanding which bucket a piece of data lives in explains most of the app's behavior.

### Household settings — the plan

Persistent structure, set during onboarding and editable anytime from Manage: salary amount, salary date (day-of-month, 1–31, defines when a period "starts"), a named list of fixed expenses, a named list of budget categories with monthly caps, and a named list of allowances. This is the template a new period is stamped from.

### Period — the ledger for one salary cycle

Exactly one period is *open* per household at a time. It holds that cycle's actual numbers: this period's salary (may diverge from the settings default if edited inline), fixed expenses with paid flags, budget categories with logged spend items, monthly-cadence allowances with their usage/cash-out items, and a free-form list of **top-ups** — itemized additions or deductions to spendable money outside the salary/budget structure. A period only advances when the user closes it (§04, Close Period); it is never silently recreated from today's date.

### Allowances — two cadences, one shape

An allowance is money set aside for a category of spend (fuel, mobile, etc.) that can be either **used directly** or **claimed as cash**, optionally capped. **Monthly** allowances reset every period, same as budget categories. **Annual** allowances are a single pool per calendar year that persists across every period in that year untouched — they never appear inside a period's own data.

### Savings collections — named, persistent pots

User-created, not period-scoped. Each has a running balance (sum of its own transaction log) and can receive money from a closing period's leftover, or send money back into the current period's spending as a top-up.

### Debts — money owed to someone else

A loan taken, or a bill someone covered for you. Not period-scoped, persists until marked paid. Taking one adds a top-up (it's spendable now); paying it off subtracts one.

---

## 04. Screens

Every screen, its gate, what's on it, and how it behaves.

### Login — `/login`

**Elements**
- Three modes toggled by tab: **Sign in**, **Create account**, **Send magic link**
- Email field (all modes); password field (sign in / create account only)
- Inline error and status messages

### Onboarding wizard — `/onboarding`

*Redirects to `/dashboard` if already onboarded.*

**Flow**
Four steps, one per domain piece, Back/Next controls: **Salary** (amount + salary date) → **Fixed expenses** → **Budget categories** → **Allowances**.

**Elements**
- Step indicator ("Step 2 of 4") and a one-line blurb per step
- Live **Unallocated / Over-allocated** summary banner, visible on every step, computed from whatever's been entered across *all* steps so far — not just the visible one
- "Finish setup" on the last step commits everything and creates the household's first period

**Edge cases**
- No validation blocks moving forward with empty lists or a zero salary — the summary banner is the only feedback.

### Dashboard — the Ledger — `/dashboard`

**Header**
- Wordmark, current period's month label, save-state text ("saving…" / "saved")
- Links: Savings, Debts, Manage
- Dismissible one-line notice when the salary date has passed the open period's start — informational only, doesn't change any data

**Close Period control**
Always-visible button, independent of the notice above. Expands into a panel — see the dedicated entry below.

**Salary card**
- Progress ring: share of effective salary spent so far, gold under 100%, red over
- Editable salary amount for *this period only*
- "+ Rs X from top-ups this period" note when top-ups are nonzero

**Unallocated / Over-allocated banner**
Effective salary minus everything committed to fixed + budget caps + monthly allowances. Red when negative.

**Stat tiles**
Money spent (paid fixed + all budget items) · Money left (effective salary − spent), red when negative.

**Fixed expenses**
- List of name, editable amount, `Paid`/`Mark paid` toggle
- Section total shown as paid/total

**Budget categories**
- Name, editable cap, spent/cap, a progress bar that turns red past the cap
- Itemized spend list (description, date, amount, remove) and an add-item row

**Allowances**
- Name (with an "ANNUAL" tag when applicable), editable amount for monthly allowances, read-only amount for annual ones
- Two itemized lists per allowance — **used directly** and **claimed as cash** — each with its own add-item row; cash-out entries are clamped to whatever room remains (a cap if set, otherwise the allowance's own remaining balance)
- "Left" (or "Left this year" for annual) and "Cash in hand" summary lines

### Close Period panel — inline on `/dashboard`

The mechanism that ends the mandatory-reconciliation requirement described in §01. Collapsed to a single "Close period" button by default.

**Expanded state**
- Every pool that's currently *positive* — Unallocated salary, Cash in hand — must get exactly one destination pick: **Bring forward** or **Save to** a chosen collection. No partial split, no skip.
- If a savings collection doesn't exist yet, that pool's "Save to" option is replaced with a link to create one on `/savings` — Bring forward still works without it.
- If both pools are zero or negative: "Nothing unallocated or in hand — ready to close."
- Total outstanding debts shown as context, with a link to `/debts` — informational, never blocks closing.
- "Close period" stays disabled until every positive pool has a pick.

**On confirm**
Writes each chosen savings deposit, marks the current period closed, opens the next period in sequence seeded from Manage's current settings, with any brought-forward amount as that period's first top-up.

### Manage — `/settings`

The same editing surface as onboarding, flattened into one page instead of stepped — every section visible and editable at once, plus the live Unallocated/Over-allocated summary.

**Elements**
- Salary amount and salary date
- Fixed expenses, budget categories: add / rename / adjust amount / remove, each removal confirmed with a warning that logged spend under it will go too
- Allowances: add / rename / change cadence / amount / cash-out cap / remove

**Behavior**
Edits save on a debounce, and cascade into the currently open period immediately — names and caps update live, while already-logged paid flags and spend items are preserved wherever the underlying entry still exists.

### Savings — `/savings`

**Elements**
- One card per named collection: editable name, running balance, a reverse-chronological transaction list (desc, date, signed amount, remove)
- Add-transaction row per collection (any amount, positive or negative, with a description and date)
- "Move to spending" control per collection — amount input clamped to the collection's balance, moves that amount into the open period as a top-up and logs a matching withdrawal
- New-collection field + add button at the bottom
- Empty state: "No savings collections yet. Create one below to set money aside."

**Edge cases**
- Removing a collection is blocked with an alert while its balance is nonzero — move the balance to spending first.

### Debts — `/debts`

**Elements**
- "You owe" summary banner — total of everything outstanding, red when nonzero
- Outstanding list: name, date, amount, `Mark paid`, remove
- Add-debt row (name, date, amount)
- A separate, visually muted "Settled" list for paid debts, with remove only

**Behavior**
Adding a debt appends a positive top-up to the open period ("Owed: …"). Marking one paid appends a negative top-up ("Repaid: …") and timestamps it settled.

---

## 05. Business rules & formulas

The arithmetic that drives every number on the dashboard, expressed the way the app actually computes it.

```
effectiveSalary   = salary + sum(topUps.amount)
totalSpent        = sum(fixed[paid].amount) + sum(budget[*].items.amount)
moneyLeft         = effectiveSalary − totalSpent
spentPct          = totalSpent / effectiveSalary                              (ring)
allocatedTotal    = sum(fixed.amount) + sum(budget.amount) + sum(allowances[period=monthly].amount)
unallocated       = effectiveSalary − allocatedTotal                          (negative → "Over-allocated")
cashInHand        = sum(allowances[period=monthly].cashoutItems.amount)       (what Close Period must place)
allowance.remaining = amount − sum(usageItems) − sum(cashoutItems)
cashoutRoom       = min(cashoutCap − cashed [if capped], remaining)
```

> **Annual allowances** are excluded from `allocatedTotal` — they're a separate yearly pool, not a draw against this month's salary, and they keep their own "Left this year" figure computed the same way but against the calendar-year pool instead.

---

## 06. Data schema reference

For context, not for the design itself — but field names map directly to what's editable on screen.

| Table | Scope | Key fields |
|---|---|---|
| `households` | 1 per signup | `id, name` |
| `household_members` | membership | `household_id, user_id, role` |
| `household_settings` | 1 per household | `salary, salary_date, fixed[], budget[], allowances[], onboarded_at` |
| `budgets` (periods) | 1 open + N closed / household | `month, salary, fixed[], budget[], allowances[], top_ups[], closed_at` |
| `allowance_periods` | 1 / annual allowance / year | `allowance_id, period_year, usage_items[], cashout_items[]` |
| `savings_collections` | N / household | `name, transactions[]` |
| `debts` | N / household | `name, amount, date, paid_at` |
| `invites` | schema only, unused | `household_id, email, status` |

Item shape reused everywhere spend is logged (budget items, allowance usage/cash-out, top-ups, savings transactions): `{ id, desc, amount, date }` — `amount` is signed where the field represents a running ledger (top-ups, savings transactions).

---

## 07. Existing visual language

The current build's actual tokens — useful as a starting point or an explicit thing to depart from.

**Type**
- Display / wordmark: **Fraunces** (serif)
- Body: **IBM Plex Sans** — labels, copy, section headers
- Numeric / data: **IBM Plex Mono**, tabular figures — every amount, date, and field on screen

**Color**

| Swatch | Hex | Role |
|---|---|---|
| ⬛ | `#101218` | Background |
| ⬛ | `#171A21` | Card |
| ⬛ | `#1B1E27` | Input |
| ⬜ | `#EDEEF2` | Text |
| ◻︎ | `#8B8FA0` | Muted text |
| 🟨 | `#D9A441` | Accent (gold) |
| 🟩 | `#6FCF97` | Positive |
| 🟥 | `#E0664F` | Negative |
| 🟦 | `#4FA6D9` | Info / progress |

**Recurring patterns**
- Dark theme only today, single mobile-width column (max 460px), centered
- Cards: 12–16px radius, 1px hairline border, no shadows
- Amounts: right-aligned, underline-only input style, comma-grouped, blank (not "0") when empty
- Status conveyed by color + a pill-shaped badge (Paid, ANNUAL) rather than icons
- Progress: a ring for overall spend, a linear bar for per-category spend, both switching gold/blue → red past 100%

---

## 08. Explicitly out of scope (today)

- **Multi-member households** — the schema supports it; no invite-acceptance UI exists. Design as single-user until this is prioritized.
- **Partial debt repayment** — a debt is paid in full or not at all, no installments.
- **Editing a closed period** — once closed, a period's numbers are final; no reopen/undo.
- **Notifications** — the salary-date notice is the only proactive signal; no email/push reminders.
- **Light theme, larger breakpoints** — the product is dark-mode, phone-width only right now.

---

*Ledger — Functional Requirements Specification, generated from the current codebase for design reference.*
