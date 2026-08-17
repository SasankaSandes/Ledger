import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  fmt,
  shortDate,
  sumItems,
  todayKey,
  uid,
  type BudgetItem,
  type HouseholdSettings,
  type SavingsCollection,
} from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { ensureOpenPeriodRow } from "@/lib/period";

// Self-contained like ClosePeriodPanel — owns its own list state (seeded
// from initialCollections) and its own Supabase mutations, ported from the
// archived SavingsView.tsx.
export function SavingsSection({
  householdId,
  settings,
  initialCollections,
}: {
  householdId: string;
  settings: HouseholdSettings;
  initialCollections: SavingsCollection[];
}) {
  const [collections, setCollections] = useState<SavingsCollection[]>(initialCollections);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addCollection = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const { data, error: insertError } = await supabase
      .from("savings_collections")
      .insert({ household_id: householdId, name: newName.trim(), transactions: [] })
      .select("id, name, transactions")
      .single();
    setBusy(false);
    if (insertError || !data) return;
    setCollections((cs) => [...cs, data as SavingsCollection]);
    setNewName("");
  };

  const addTransaction = async (collection: SavingsCollection, desc: string, amount: number) => {
    const item: BudgetItem = { id: uid(), desc, amount, date: todayKey() };
    const transactions = [...collection.transactions, item];
    setCollections((cs) => cs.map((c) => (c.id === collection.id ? { ...c, transactions } : c)));
    await supabase
      .from("savings_collections")
      .update({ transactions, updated_at: new Date().toISOString() })
      .eq("id", collection.id);
  };

  const removeTransaction = async (collection: SavingsCollection, itemId: string) => {
    const transactions = collection.transactions.filter((t) => t.id !== itemId);
    setCollections((cs) => cs.map((c) => (c.id === collection.id ? { ...c, transactions } : c)));
    await supabase
      .from("savings_collections")
      .update({ transactions, updated_at: new Date().toISOString() })
      .eq("id", collection.id);
  };

  // Blocked whenever the balance is nonzero in either direction — move it
  // to spending first, matching the archived guard exactly (`!== 0`, not `> 0`).
  const removeCollection = async (collection: SavingsCollection) => {
    const balance = sumItems(collection.transactions);
    if (balance !== 0) {
      setError(`Move the ${fmt(balance)} balance to spending first before removing "${collection.name}".`);
      return;
    }
    setError(null);
    await supabase.from("savings_collections").delete().eq("id", collection.id);
    setCollections((cs) => cs.filter((c) => c.id !== collection.id));
  };

  // Two separate writes, not atomic — matches the archived precedent. A
  // positive top-up lands on the open period; a matching negative
  // withdrawal lands on the collection.
  const moveToSpending = async (collection: SavingsCollection, amount: number) => {
    const balance = sumItems(collection.transactions);
    if (amount <= 0 || amount > balance) return;
    setBusy(true);
    const { month, monthly } = await ensureOpenPeriodRow(supabase, householdId, settings);
    const topUp: BudgetItem = { id: uid(), desc: `From savings: ${collection.name}`, amount, date: todayKey() };
    await supabase
      .from("budgets")
      .update({ top_ups: [...monthly.topUps, topUp], updated_at: new Date().toISOString() })
      .eq("household_id", householdId)
      .eq("month", month);

    const withdrawal: BudgetItem = { id: uid(), desc: "To spending", amount: -amount, date: todayKey() };
    const transactions = [...collection.transactions, withdrawal];
    await supabase
      .from("savings_collections")
      .update({ transactions, updated_at: new Date().toISOString() })
      .eq("id", collection.id);
    setCollections((cs) => cs.map((c) => (c.id === collection.id ? { ...c, transactions } : c)));
    setBusy(false);
  };

  return (
    <View className="gap-2.5">
      {error && <Text className="text-[12px] text-negative">{error}</Text>}

      {collections.length === 0 && (
        <Text className="text-[12.5px] text-muted2">
          No savings collections yet. Create one to set money aside.
        </Text>
      )}

      {collections.map((c) => (
        <CollectionCard
          key={c.id}
          collection={c}
          busy={busy}
          onAddTransaction={(desc, amount) => addTransaction(c, desc, amount)}
          onRemoveTransaction={(id) => removeTransaction(c, id)}
          onRemoveCollection={() => removeCollection(c)}
          onMoveToSpending={(amount) => moveToSpending(c, amount)}
        />
      ))}

      <View className="flex-row gap-1.5">
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="New collection"
          placeholderTextColor="#5C6070"
          onSubmitEditing={addCollection}
          className="flex-1 rounded-lg border border-line/10 bg-input px-3 py-2.5 text-[12.5px] text-text"
        />
        <Pressable onPress={addCollection} className="w-11 items-center justify-center rounded-lg bg-fill">
          <Text className="text-[16px] text-gold">+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CollectionCard({
  collection,
  busy,
  onAddTransaction,
  onRemoveTransaction,
  onRemoveCollection,
  onMoveToSpending,
}: {
  collection: SavingsCollection;
  busy: boolean;
  onAddTransaction: (desc: string, amount: number) => void;
  onRemoveTransaction: (itemId: string) => void;
  onRemoveCollection: () => void;
  onMoveToSpending: (amount: number) => void;
}) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [moveAmount, setMoveAmount] = useState("");
  const balance = sumItems(collection.transactions);

  const submitAdd = () => {
    const amt = Number(amount.replace(/[^0-9.-]/g, ""));
    if (!amt) return;
    onAddTransaction(desc || (amt < 0 ? "Withdrawal" : "Deposit"), amt);
    setDesc("");
    setAmount("");
  };

  const submitMove = () => {
    const amt = Number(moveAmount.replace(/[^0-9.]/g, ""));
    if (!amt) return;
    onMoveToSpending(Math.min(amt, balance));
    setMoveAmount("");
  };

  return (
    <View className="rounded-[13px] border border-line/10 bg-card px-3.5 py-3.5">
      <View className="flex-row items-baseline justify-between">
        <Text className="font-body-medium text-[13.5px] text-text">{collection.name}</Text>
        <View className="flex-row items-center gap-2.5">
          <Text className="font-mono text-[15px] text-positive">{fmt(balance)}</Text>
          <Pressable onPress={onRemoveCollection} hitSlop={8}>
            <Text className="px-0.5 text-[14px] text-faint">×</Text>
          </Pressable>
        </View>
      </View>

      {collection.transactions.length === 0 ? (
        <Text className="pt-2 text-[12px] text-muted2">Nothing logged yet.</Text>
      ) : (
        [...collection.transactions].reverse().map((t) => (
          <View key={t.id} className="flex-row items-center gap-2.5 py-1.5">
            <Text className="flex-1 text-[12.5px] text-text2" numberOfLines={1}>
              {t.desc}
            </Text>
            <Text className="font-mono text-[10.5px] text-muted2">{shortDate(t.date)}</Text>
            <Text
              className={`min-w-[70px] text-right font-mono text-[12.5px] ${
                t.amount < 0 ? "text-negative" : "text-positive"
              }`}
            >
              {t.amount < 0 ? "−" : "+"}
              {Math.abs(t.amount).toLocaleString()}
            </Text>
            <Pressable onPress={() => onRemoveTransaction(t.id)} hitSlop={8}>
              <Text className="px-0.5 text-[14px] text-faint">×</Text>
            </Pressable>
          </View>
        ))
      )}

      <View className="mt-2.5 flex-row gap-[7px]">
        <TextInput
          value={desc}
          onChangeText={setDesc}
          placeholder="description"
          placeholderTextColor="#5C6070"
          className="flex-1 rounded-lg border border-line/10 bg-input px-2.5 py-2.5 text-[12.5px] text-text"
        />
        <TextInput
          value={amount}
          onChangeText={setAmount}
          inputMode="numeric"
          placeholder="0"
          placeholderTextColor="#5C6070"
          onSubmitEditing={submitAdd}
          className="w-[78px] rounded-lg border border-line/10 bg-input px-2.5 py-2.5 text-right font-mono text-[12.5px] text-text"
        />
        <Pressable onPress={submitAdd} className="w-[38px] items-center justify-center rounded-lg bg-fill">
          <Text className="text-[16px] text-gold">+</Text>
        </Pressable>
      </View>

      <View className="mt-2.5 flex-row items-center gap-[7px]">
        <TextInput
          value={moveAmount}
          onChangeText={setMoveAmount}
          inputMode="numeric"
          placeholder="0"
          placeholderTextColor="#5C6070"
          className="w-24 rounded-lg border border-line/10 bg-input px-2.5 py-2 text-right font-mono text-[12.5px] text-text"
        />
        <Pressable
          onPress={submitMove}
          disabled={busy}
          className="flex-1 items-center rounded-lg border border-line/15 py-2"
          style={{ opacity: busy ? 0.6 : 1 }}
        >
          <Text className="text-[12px] text-text2">Move to spending</Text>
        </Pressable>
      </View>
    </View>
  );
}
