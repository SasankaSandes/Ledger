import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import type { HouseholdMember } from "@/lib/supabase/queries";

const SAVE_DEBOUNCE_MS = 500;

// Per-viewer private nicknames for the other household members. `onChange`
// (HouseholdProvider.setNicknames) both updates app-wide state and persists,
// so this component only debounces it — no direct Supabase call. The map it
// emits is the complete { memberUserId: nickname } object, with empty entries
// dropped so "no nickname" is absence, not "".
export function MemberNicknamesEditor({
  members,
  myId,
  nicknames,
  onChange,
}: {
  members: HouseholdMember[];
  myId: string | undefined;
  nicknames: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(nicknames);
  const draftRef = useRef(draft);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const others = members.filter((m) => m.userId !== myId);

  const edit = (userId: string, raw: string) => {
    const next = { ...draftRef.current, [userId]: raw };
    draftRef.current = next;
    setDraft(next);

    if (timers.current[userId]) clearTimeout(timers.current[userId]);
    timers.current[userId] = setTimeout(() => {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(draftRef.current)) {
        const trimmed = v.trim();
        if (trimmed) cleaned[k] = trimmed;
      }
      onChange(cleaned);
    }, SAVE_DEBOUNCE_MS);
  };

  if (others.length === 0) {
    return <Text className="text-[12.5px] text-muted2">No other members yet.</Text>;
  }

  return (
    <View className="gap-2">
      {others.map((m) => (
        <View key={m.userId} className="gap-1.5 rounded-xl border border-line/10 bg-card px-3.5 py-3">
          <Text className="text-[11px] text-muted2" numberOfLines={1}>
            {m.email}
          </Text>
          <TextInput
            value={draft[m.userId] ?? ""}
            onChangeText={(t) => edit(m.userId, t)}
            placeholder="Nickname"
            placeholderTextColor="#5C6070"
            autoCapitalize="words"
            className="rounded-lg border border-line/10 bg-input px-3 py-2.5 text-[13px] text-text"
          />
        </View>
      ))}
    </View>
  );
}
