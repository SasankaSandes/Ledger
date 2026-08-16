import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Shared page shell: bg color, safe-area top inset, max-width-ish mobile
// column (matching the prototype's 420px-centered container, though on a
// real phone this just fills the width). Wrap screen content in this
// rather than repeating the same View/ScrollView boilerplate everywhere.
export function Screen({
  children,
  scroll = true,
  edges,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ("top" | "bottom" | "left" | "right")[];
}) {
  const Wrapper = scroll ? ScrollView : View;
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={edges ?? ["top"]}>
      <Wrapper
        className="flex-1"
        {...(scroll ? { contentContainerStyle: { paddingBottom: 40 } } : {})}
      >
        {children}
      </Wrapper>
    </SafeAreaView>
  );
}
