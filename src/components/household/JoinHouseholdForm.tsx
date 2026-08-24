import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { confirmAction } from "@/lib/confirm";
import { redeemInvite, type RedeemedHousehold } from "@/lib/supabase/queries";

// Reused by both the "no household" landing screen (nothing to lose,
// warnBeforeSwitch=false) and the Household settings screen (the user
// already has real data in their current household, warnBeforeSwitch=true).
export function JoinHouseholdForm({
  warnBeforeSwitch,
  onJoined,
}: {
  warnBeforeSwitch: boolean;
  onJoined: (result: RedeemedHousehold) => void;
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doRedeem = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await redeemInvite(supabase, code.trim());
      setCode("");
      onJoined(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join that household.");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = () => {
    if (!code.trim() || submitting) return;
    if (warnBeforeSwitch) {
      confirmAction(
        "Switch households?",
        "You'll lose access to your current household's data — it isn't deleted, just no longer reachable by you.",
        "Switch",
        doRedeem
      );
    } else {
      doRedeem();
    }
  };

  return (
    <View className="gap-2">
      {error && <Text className="text-[11.5px] text-negative">{error}</Text>}
      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        placeholder="Enter code"
        autoCapitalize="characters"
        autoCorrect={false}
        onSubmitEditing={submit}
        placeholderTextColor="#5C6070"
        className="rounded-lg border border-line/10 bg-input px-3 py-2.5 text-center font-mono text-[16px] tracking-[4px] text-text"
      />
      <Pressable
        onPress={submit}
        disabled={submitting || !code.trim()}
        className="items-center rounded-lg bg-gold py-2.5"
        style={{ opacity: submitting || !code.trim() ? 0.6 : 1 }}
      >
        <Text className="font-body-semibold text-[14px] text-on-gold">
          {submitting ? "Joining…" : "Join household"}
        </Text>
      </Pressable>
    </View>
  );
}
