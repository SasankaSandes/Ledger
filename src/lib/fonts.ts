import {
  useFonts,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
} from "@expo-google-fonts/fraunces";
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from "@expo-google-fonts/ibm-plex-sans";
import {
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from "@expo-google-fonts/ibm-plex-mono";

// Keys here must match tailwind.config.js's fontFamily values exactly —
// NativeWind resolves font-display/font-body/etc. to these exact strings.
export function useAppFonts() {
  return useFonts({
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
}
