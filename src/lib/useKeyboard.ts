import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

// The on-screen keyboard, as far as Quick Add cares:
//
//   inset   pixels of the page bottom the keyboard is covering — web only, 0
//           elsewhere. Mobile browsers (iOS Safari and the installed PWA, Chrome)
//           leave the layout viewport at full height when the keyboard opens and
//           only shrink the *visual* viewport, so a bottom-pinned button ends up
//           underneath it; padding a container by this much lifts it back above.
//           KeyboardAvoidingView already handles iOS native, and Android resizes
//           the window itself.
//   visible whether a keyboard is up at all, on every platform.
//
// Web details: 0 also for browsers that resize the layout viewport instead
// (visualViewport then matches innerHeight), and while pinch-zoomed
// (scale !== 1), where the visual viewport shrinks without any keyboard.
const MIN_KEYBOARD_PX = 80;

export function useKeyboard(): { inset: number; visible: boolean } {
  const [inset, setInset] = useState(0);
  const [nativeVisible, setNativeVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // offsetTop: iOS pans the visual viewport down inside the layout viewport
      // to keep the focused field visible; the keyboard starts below that.
      const covered = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      setInset(vv.scale === 1 && covered >= MIN_KEYBOARD_PX ? covered : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    // "Will" events on iOS so the layout moves with the keyboard, not after it.
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", () => setNativeVisible(true));
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setNativeVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return { inset, visible: Platform.OS === "web" ? inset > 0 : nativeVisible };
}
