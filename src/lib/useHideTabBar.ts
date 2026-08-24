import { useLayoutEffect } from "react";
import { useNavigation } from "expo-router";
import { useColorScheme } from "nativewind";
import { tabBarStyle } from "@/lib/theme/tokens";

// Hides the root Tabs navigator's bottom bar for as long as the calling
// screen is mounted, restoring it on unmount — for secondary pages pushed
// from a tab (e.g. Settings > Categories) so they read as a focused,
// full-screen flow rather than still looking like a tab.
//
// This is the React Navigation-recommended pattern (navigation.getParent()
// + setOptions in a layout effect), reached here via expo-router's
// path-based useNavigation("/(tabs)") instead of chained .getParent()
// calls. The alternative — a route-state-aware screenOptions function on
// the Tabs navigator using getFocusedRouteNameFromRoute — does NOT work
// reliably here: verified by instrumentation that route.state stays
// undefined on the parent Tabs' screenOptions even after navigating deep
// into a nested Stack, so that function only ever re-evaluates as if
// nothing nested had happened.
//
// Cleanup restores the exact themed tabBarStyle() object, not `undefined`
// — passing undefined to setOptions falls back to react-navigation's own
// unstyled (white) default rather than back to (tabs)/_layout.tsx's
// screenOptions value, which left the restored tab bar not respecting
// dark mode.
export function useHideTabBar() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tabs = useNavigation<any>("/(tabs)");
  const { colorScheme } = useColorScheme();

  useLayoutEffect(() => {
    tabs.setOptions({ tabBarStyle: { display: "none" } });
    return () => tabs.setOptions({ tabBarStyle: tabBarStyle(colorScheme) });
  }, [tabs, colorScheme]);
}
