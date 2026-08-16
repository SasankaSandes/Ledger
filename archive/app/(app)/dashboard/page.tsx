import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Ledger from "@/components/Ledger";
import { ensureOpenPeriodRow } from "@/lib/period";
import {
  householdSettingsFromRow,
  periodKey,
  type AllowanceInstance,
  type HouseholdSettings,
  type LedgerState,
} from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("No household found for this user.");
  }

  const householdId = membership.household_id as string;

  const { data: settingsRow, error: settingsError } = await supabase
    .from("household_settings")
    .select("salary, salary_date, fixed, budget, allowances, onboarded_at")
    .eq("household_id", householdId)
    .maybeSingle();

  if (settingsError) throw settingsError;
  if (!settingsRow || !settingsRow.onboarded_at) {
    redirect("/onboarding");
  }

  const settings: HouseholdSettings = householdSettingsFromRow(settingsRow);
  const year = new Date().getFullYear();

  const { month, monthly } = await ensureOpenPeriodRow(supabase, householdId, settings);

  // Annual allowances never live in `budgets` — one allowance_periods row
  // per household per allowance per calendar year holds the running balance
  // so it carries forward across months untouched until the year resets.
  const annualDefs = settings.allowances.filter((a) => a.period === "annual");
  let annualInstances: AllowanceInstance[] = [];

  if (annualDefs.length > 0) {
    const annualIds = annualDefs.map((a) => a.id);

    // Make sure this year's row exists for every annual allowance. Upsert
    // with ignoreDuplicates so a race with another request (or another
    // household member) just no-ops instead of erroring.
    await supabase.from("allowance_periods").upsert(
      annualIds.map((id) => ({
        household_id: householdId,
        allowance_id: id,
        period_year: year,
        usage_items: [],
        cashout_items: [],
      })),
      { onConflict: "household_id,allowance_id,period_year", ignoreDuplicates: true }
    );

    const { data: periods } = await supabase
      .from("allowance_periods")
      .select("allowance_id, usage_items, cashout_items")
      .eq("household_id", householdId)
      .eq("period_year", year)
      .in("allowance_id", annualIds);

    const byAllowanceId = new Map((periods ?? []).map((p) => [p.allowance_id, p]));
    annualInstances = annualDefs.map((a) => {
      const period = byAllowanceId.get(a.id);
      return {
        ...a,
        usageItems: period?.usage_items ?? [],
        cashoutItems: period?.cashout_items ?? [],
      };
    });
  }

  const { data: collections } = await supabase
    .from("savings_collections")
    .select("id, name")
    .eq("household_id", householdId);

  const { data: debtRows } = await supabase
    .from("debts")
    .select("amount")
    .eq("household_id", householdId)
    .is("paid_at", null);
  const outstandingDebtTotal = (debtRows ?? []).reduce((s, d) => s + Number(d.amount || 0), 0);

  // Purely a nudge — the salary date has moved on to a different period
  // than the one still open. Doesn't change any data on its own; closing
  // is always a manual, deliberate action (see ClosePeriodPanel).
  const periodStale = periodKey(settings.salaryDate) !== month;

  const initialState: LedgerState = {
    salary: monthly.salary,
    fixed: monthly.fixed,
    budget: monthly.budget,
    allowances: [...monthly.allowances, ...annualInstances],
    topUps: monthly.topUps,
  };

  return (
    <Ledger
      householdId={householdId}
      month={month}
      year={year}
      settings={settings}
      initialState={initialState}
      periodStale={periodStale}
      savingsCollections={collections ?? []}
      outstandingDebtTotal={outstandingDebtTotal}
    />
  );
}
