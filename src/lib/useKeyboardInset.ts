import { useEffect, useState } from "react";
import { Platform } from "react-native";

// How many pixels of the bottom of the page the on-screen keyboard is covering,
// on the web. Mobile browsers (iOS Safari and the installed PWA, Chrome) leave
// the layout viewport at full height when the keyboard opens and only shrink
// the *visual* viewport, so a bottom-pinned button ends up underneath it.
// Padding a container by this much lifts it back above the keyboard.
//
// Always 0 off the web: KeyboardAvoidingView already handles iOS, and Android
// resizes the window itself. Also 0 for browsers that resize the layout viewport
// instead (visualViewport then matches innerHeight) and while pinch-zoomed
// (scale !== 1), where the visual viewport shrinks without any keyboard.
const MIN_KEYBOARD_PX = 80;

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

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

  return inset;
}
