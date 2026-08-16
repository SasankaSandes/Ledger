import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

const SIZE = 74;
const STROKE = 7;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Overall spend-percentage ring — ports the prototype's SVG circumference
// math directly (stroke-dasharray = circumference, stroke-dashoffset moves
// from 0% to 100%).
export function Ring({ pct, color, trackColor }: { pct: number; color: string; trackColor: string }) {
  const clamped = Math.min(1, Math.max(0, pct));
  const offset = CIRCUMFERENCE - CIRCUMFERENCE * clamped;

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={trackColor} strokeWidth={STROKE} />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </Svg>
    </View>
  );
}
