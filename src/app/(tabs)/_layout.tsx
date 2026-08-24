import { Pressable, Text, View } from "react-native";
import { router, Tabs } from "expo-router";
import { useColorScheme } from "nativewind";
import { darkTokens, lightTokens, tabBarStyle } from "@/lib/theme/tokens";
import { ActivityIcon, HomeIcon, PotsIcon, SettingsIcon } from "@/components/ui/TabBarIcons";

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      className={`text-[11px] tracking-wide ${focused ? "text-gold font-body-semibold" : "text-muted font-body"}`}
    >
      {label}
    </Text>
  );
}

// The center tab never navigates to a normal screen — it opens the
// quick-add modal instead. A fully custom tabBarButton replaces default
// press handling entirely, which is simpler and more reliable than trying
// to intercept/prevent the default tabPress event. Untyped props: the
// underlying BottomTabBarButtonProps type isn't part of expo-router's
// public export surface, and every prop it'd carry is ignored anyway.
function QuickAddButton(_props: object) {
  return (
    <View className="flex-1 items-center justify-center">
      <Pressable
        onPress={() => router.push("/quick-add")}
        className="h-[52px] w-[52px] items-center justify-center rounded-full bg-gold"
        style={{ marginTop: -18 }}
      >
        <Text className="text-[26px] leading-[26px] text-on-gold">+</Text>
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  // tabBarStyle is a react-navigation style prop, not a NativeWind
  // className, so it doesn't get the CSS-variable treatment — resolve the
  // active theme's tokens directly instead.
  const { colorScheme } = useColorScheme();
  const tokens = colorScheme === "dark" ? darkTokens : lightTokens;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: tabBarStyle(colorScheme),
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="Home" focused={focused} />,
          tabBarIcon: ({ focused }) => <HomeIcon color={focused ? tokens.gold : tokens.muted} size={22} />,
        }}
      />
      <Tabs.Screen
        name="pots"
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="Pots" focused={focused} />,
          tabBarIcon: ({ focused }) => <PotsIcon color={focused ? tokens.gold : tokens.muted} size={22} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{ tabBarButton: (props) => <QuickAddButton {...props} /> }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="Activity" focused={focused} />,
          tabBarIcon: ({ focused }) => <ActivityIcon color={focused ? tokens.gold : tokens.muted} size={22} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="Settings" focused={focused} />,
          tabBarIcon: ({ focused }) => <SettingsIcon color={focused ? tokens.gold : tokens.muted} size={22} />,
        }}
      />
    </Tabs>
  );
}
