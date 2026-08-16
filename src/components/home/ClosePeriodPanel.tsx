import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { fmt, uid, type BudgetItem } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import type { ForwardLineItem } from "@/lib/period";

export type Pool = { key: string; label: string; amount: number };
export type SavingsCollectionOption = { id: string; name: string };

type PoolAllocation = { forward: string; saveAmount: string; saveTo: string; newName: string };

const NEW_COLLECTION = "__new__";

export function ClosePeriodPanel({
  pools,
  savingsCollections,
  householdId,
  onConfirm,
}: {
  pools: Pool[];
  savingsCollections: SavingsCollectionOption[];
  householdId: string;
  // Called once every pool is fully placed; owns writing savings deposits
  // and closing the period.
  onConfirm: (forwardItems: ForwardLineItem[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<Record<string, PoolAllocation>>({});

  const getAlloc = (key: string): PoolAllocation =>
    allocations[key] ?? { forward: "", saveAmount: "", saveTo: savingsCollections[0]?.id ?? NEW_COLLECTION, newName: "" };

  const patchAlloc = (key: string, patch: Partial<PoolAllocation>) =>
    setAllocations((cur) => ({ ...cur, [key]: { ...getAlloc(key), ...patch } }));

  const num = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;

  const remainingFor = (pool: Pool) => {
    const a = getAlloc(pool.key);
    return pool.amount - num(a.forward) - num(a.saveAmount);
  };

  const ready = pools.every((p) => remainingFor(p) === 0);

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} className="mt-3 rounded-xl border border-gold/35 px-[15px] py-[15px]">
        <Text className="text-center font-body-medium text-[13.5px] text-gold">Close period</Text>
      </Pressable>
    );
  }

  const confirm = async () => {
    if (!ready) return;
    setClosing(true);
    setError(null);
    try {
      const forwardItems: ForwardLineItem[] = [];

      for (const pool of pools) {
        const a = getAlloc(pool.key);
        const forwardAmt = num(a.forward);
        const saveAmt = num(a.saveAmount);

        if (forwardAmt > 0) {
          forwardItems.push({ amount: forwardAmt, desc: `Carried forward from ${pool.label}` });
        }

        if (saveAmt > 0) {
          let collectionId = a.saveTo;
          if (collectionId === NEW_COLLECTION || !collectionId) {
            const name = a.newName.trim();
            if (!name) throw new Error(`Name the new collection for ${pool.label}`);
            const { data, error } = await supabase
              .from("savings_collections")
              .insert({ household_id: householdId, name, transactions: [] })
              .select("id")
              .single();
            if (error) throw error;
            collectionId = data.id;
          }
          const { data: existing, error: fetchError } = await supabase
            .from("savings_collections")
            .select("transactions")
            .eq("id", collectionId)
            .single();
          if (fetchError) throw fetchError;
          const transaction: BudgetItem = {
            id: uid(),
            desc: `From ${pool.label.toLowerCase()}`,
            amount: saveAmt,
            date: new Date().toISOString().slice(0, 10),
          };
          const { error: saveError } = await supabase
            .from("savings_collections")
            .update({
              transactions: [...(existing?.transactions ?? []), transaction],
              updated_at: new Date().toISOString(),
            })
            .eq("id", collectionId);
          if (saveError) throw saveError;
        }
      }

      await onConfirm(forwardItems);
      setOpen(false);
      setAllocations({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setClosing(false);
    }
  };

  return (
    <View className="mt-3 rounded-2xl border border-gold/35 bg-card px-4 py-4">
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="font-display text-[17px] text-text">Close period</Text>
        <Pressable onPress={() => setOpen(false)} hitSlop={8}>
          <Text className="text-[17px] leading-none text-muted2">×</Text>
        </Pressable>
      </View>
      <Text className="mb-3.5 text-[12px] leading-5 text-muted">
        Every rupee still positive has to be placed before the period can close.
      </Text>

      {pools.length === 0 ? (
        <Text className="pb-3.5 text-[12.5px] text-muted">Nothing unallocated or in hand — ready to close.</Text>
      ) : (
        pools.map((pool) => {
          const a = getAlloc(pool.key);
          const remaining = remainingFor(pool);
          return (
            <View key={pool.key} className="mb-3.5 rounded-[11px] border border-line/10 bg-input p-3.5">
              <View className="flex-row items-baseline justify-between">
                <Text className="font-body-medium text-[12.5px] text-text">{pool.label}</Text>
                <Text className="font-mono text-[14px] text-gold">{fmt(pool.amount)}</Text>
              </View>

              <View className="mt-2.5 flex-row items-center gap-2">
                <Text className="flex-1 text-[12px] text-muted">Bring forward</Text>
                <TextInput
                  value={a.forward}
                  onChangeText={(v) => patchAlloc(pool.key, { forward: v })}
                  inputMode="numeric"
                  placeholder="0"
                  placeholderTextColor="#5C6070"
                  className="w-24 rounded-lg border border-line/10 bg-bg px-2.5 py-2 text-right font-mono text-[12.5px] text-text"
                />
              </View>

              <View className="mt-2 flex-row items-center gap-2">
                {savingsCollections.length > 0 && (
                  <View className="flex-1 flex-row flex-wrap gap-1.5">
                    {savingsCollections.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => patchAlloc(pool.key, { saveTo: c.id })}
                        className={`rounded-full border px-2.5 py-1 ${
                          a.saveTo === c.id ? "border-gold/40 bg-gold/[0.1]" : "border-line/15"
                        }`}
                      >
                        <Text className={`text-[11px] ${a.saveTo === c.id ? "text-gold" : "text-muted"}`}>
                          {c.name}
                        </Text>
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => patchAlloc(pool.key, { saveTo: NEW_COLLECTION })}
                      className={`rounded-full border px-2.5 py-1 ${
                        a.saveTo === NEW_COLLECTION ? "border-gold/40 bg-gold/[0.1]" : "border-line/15"
                      }`}
                    >
                      <Text className={`text-[11px] ${a.saveTo === NEW_COLLECTION ? "text-gold" : "text-muted"}`}>
                        + New
                      </Text>
                    </Pressable>
                  </View>
                )}
                <TextInput
                  value={a.saveAmount}
                  onChangeText={(v) => patchAlloc(pool.key, { saveAmount: v })}
                  inputMode="numeric"
                  placeholder="0"
                  placeholderTextColor="#5C6070"
                  className="w-24 rounded-lg border border-line/10 bg-bg px-2.5 py-2 text-right font-mono text-[12.5px] text-text"
                />
              </View>

              {(savingsCollections.length === 0 || a.saveTo === NEW_COLLECTION) && (
                <TextInput
                  value={a.newName}
                  onChangeText={(v) => patchAlloc(pool.key, { newName: v })}
                  placeholder="New collection name"
                  placeholderTextColor="#5C6070"
                  className="mt-2 rounded-lg border border-line/10 bg-bg px-2.5 py-2 text-[12px] text-text"
                />
              )}

              <Text className={`mt-2.5 font-mono text-[11.5px] ${remaining === 0 ? "text-positive" : "text-negative"}`}>
                {remaining === 0
                  ? "All placed ✓"
                  : remaining > 0
                    ? `${fmt(remaining)} still to place`
                    : `Over by ${fmt(-remaining)}`}
              </Text>
            </View>
          );
        })
      )}

      {error && <Text className="mb-2.5 text-[12px] text-negative">{error}</Text>}

      <Pressable
        onPress={confirm}
        disabled={closing || !ready}
        className={`items-center rounded-[11px] py-3.5 ${ready ? "bg-gold" : "bg-fill"}`}
        style={{ opacity: closing ? 0.7 : 1 }}
      >
        <Text className={`font-body-semibold text-[13.5px] ${ready ? "text-on-gold" : "text-muted2"}`}>
          {closing ? "Closing…" : ready ? "Close period" : "Place every rupee first"}
        </Text>
      </Pressable>
    </View>
  );
}
