// Required for Tabs.Screen name="add" to resolve to a real route, but its
// tabBarButton is fully replaced in (tabs)/_layout.tsx to open the
// quick-add modal instead of navigating here — this never actually renders.
export default function Add() {
  return null;
}
