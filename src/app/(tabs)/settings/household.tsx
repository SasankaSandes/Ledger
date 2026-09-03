import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Platform, Pressable, Share, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { JoinHouseholdForm } from "@/components/household/JoinHouseholdForm";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { confirmAction } from "@/lib/confirm";
import { supabase } from "@/lib/supabase/client";
import { useHideTabBar } from "@/lib/useHideTabBar";
import {
  createInvite,
  getHouseholdName,
  listHouseholdMembers,
  listPendingInvites,
  removeMember,
  renameHousehold,
  revokeInvite,
  type HouseholdMember,
  type PendingInvite,
} from "@/lib/supabase/queries";

const RENAME_DEBOUNCE_MS = 500;

export default function HouseholdScreen() {
  useHideTabBar();
  const { householdId, role, refresh } = useHousehold();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [name, setName] = useState("");
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwner = role === "owner";

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    try {
      const [householdName, roster, pending] = await Promise.all([
        getHouseholdName(supabase, householdId),
        listHouseholdMembers(supabase, householdId),
        isOwner ? listPendingInvites(supabase, householdId) : Promise.resolve([]),
      ]);
      setName(householdName);
      setMembers(roster);
      setInvites(pending);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load household.");
    } finally {
      setLoading(false);
    }
  }, [householdId, isOwner]);

  useEffect(() => {
    load();
  }, [load]);

  const rename = (next: string) => {
    setName(next);
    if (!householdId) return;
    if (renameTimer.current) clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(async () => {
      try {
        await renameHousehold(supabase, householdId, next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't rename household.");
      }
    }, RENAME_DEBOUNCE_MS);
  };

  const generateInvite = async () => {
    if (!householdId || !userId) return;
    setGenerating(true);
    setError(null);
    try {
      const invite = await createInvite(supabase, householdId, userId);
      setInvites((prev) => [invite, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate an invite code.");
    } finally {
      setGenerating(false);
    }
  };

  const doRevoke = async (id: string) => {
    setInvites((prev) => prev.filter((i) => i.id !== id));
    try {
      await revokeInvite(supabase, id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't revoke invite.");
      load();
    }
  };

  const confirmRevoke = (invite: PendingInvite) => {
    confirmAction("Revoke this code?", `${invite.code} will no longer work.`, "Revoke", () => doRevoke(invite.id));
  };

  const shareInvite = (code: string) => {
    Share.share({ message: `Join my household on Ledger — enter this code: ${code}` });
  };

  const doRemoveMember = async (member: HouseholdMember) => {
    if (!householdId) return;
    setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
    try {
      await removeMember(supabase, householdId, member.userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove member.");
      load();
    }
  };

  const confirmRemoveMember = (member: HouseholdMember) => {
    confirmAction("Remove this member?", `${member.email} will lose access to this household.`, "Remove", () =>
      doRemoveMember(member)
    );
  };

  const doLeave = async () => {
    if (!householdId || !userId) return;
    await removeMember(supabase, householdId, userId);
    await refresh(); // householdId -> null, root guard routes to no-household
  };

  const confirmLeave = () => {
    confirmAction(
      "Leave this household?",
      "You'll lose access to its shared data. You can create a new household or join another afterward.",
      "Leave",
      doLeave
    );
  };

  const onJoinedDifferentHousehold = async () => {
    await refresh();
    router.back();
  };

  if (loading || !householdId) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[13px] text-muted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="px-[18px] pb-[60px] pt-7">
        <Pressable onPress={() => router.back()} hitSlop={8} className="mb-3 flex-row items-center gap-1">
          <Text className="text-[13px] text-muted">‹ Back</Text>
        </Pressable>

        <Text className="mb-1 font-display text-[22px] text-text">Household</Text>
        <Text className="mb-5 text-[11px] text-muted2">Shared with everyone below — same categories, pots, and transactions.</Text>

        {error && <Text className="mb-3 text-[12.5px] text-negative">{error}</Text>}

        <View className="mb-4 gap-2 rounded-2xl border border-line/10 bg-card px-5 py-[18px]">
          <Text className="text-[11px] font-body-semibold uppercase tracking-wider text-muted">Name</Text>
          {isOwner ? (
            <TextInput
              value={name}
              onChangeText={rename}
              className="font-body-medium text-[15px] text-text"
            />
          ) : (
            <Text className="font-body-medium text-[15px] text-text">{name}</Text>
          )}
        </View>

        <View className="mb-4 gap-2 rounded-2xl border border-line/10 bg-card px-5 py-[18px]">
          <Text className="mb-1 text-[11px] font-body-semibold uppercase tracking-wider text-muted">
            Members
          </Text>
          {members.map((member) => (
            <View key={member.userId} className="flex-row items-center gap-2 py-1.5">
              <View className="flex-1">
                <Text className="text-[13px] text-text2">{member.email}</Text>
                <Text className="mt-0.5 text-[10.5px] uppercase tracking-wide text-muted2">{member.role}</Text>
              </View>
              {isOwner && member.userId !== userId && (
                <Pressable onPress={() => confirmRemoveMember(member)} hitSlop={8}>
                  <Text className="px-0.5 text-[15px] text-faint">×</Text>
                </Pressable>
              )}
            </View>
          ))}
          {members.length > 1 && (
            <Pressable
              onPress={() => router.push("/settings/member-names")}
              className="mt-1 flex-row items-center justify-between border-t border-line/10 pt-2.5"
            >
              <Text className="text-[12.5px] text-info">Set member names</Text>
              <Text className="text-[13px] text-muted2">›</Text>
            </Pressable>
          )}
        </View>

        {isOwner && (
          <View className="mb-4 gap-3 rounded-2xl border border-line/10 bg-card px-5 py-[18px]">
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-body-semibold uppercase tracking-wider text-muted">
                Invite
              </Text>
              <Pressable onPress={generateInvite} disabled={generating}>
                <Text className="text-[12.5px] font-body-semibold text-gold" style={{ opacity: generating ? 0.6 : 1 }}>
                  {generating ? "Generating…" : "+ New code"}
                </Text>
              </Pressable>
            </View>
            {invites.length === 0 && (
              <Text className="text-[11.5px] text-muted2">No pending invites.</Text>
            )}
            {invites.map((invite) => (
              <View key={invite.id} className="gap-2 rounded-xl border border-line/10 bg-input px-3.5 py-3">
                <Text className="text-center font-mono text-[20px] tracking-[6px] text-text">{invite.code}</Text>
                <View className="flex-row justify-center gap-4">
                  {Platform.OS !== "web" && (
                    <Pressable onPress={() => shareInvite(invite.code)} hitSlop={8}>
                      <Text className="text-[11.5px] text-info">Share</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => confirmRevoke(invite)} hitSlop={8}>
                    <Text className="text-[11.5px] text-negative">Revoke</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        <View className="mb-4 gap-3 rounded-2xl border border-line/10 bg-card px-5 py-[18px]">
          <Text className="text-[11px] font-body-semibold uppercase tracking-wider text-muted">
            Join a different household
          </Text>
          <JoinHouseholdForm warnBeforeSwitch onJoined={onJoinedDifferentHousehold} />
        </View>

        {!isOwner && (
          <Pressable
            onPress={confirmLeave}
            className="items-center rounded-2xl border border-negative/25 bg-card px-3.5 py-3.5"
          >
            <Text className="text-[13px] font-body-medium text-negative">Leave household</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}
