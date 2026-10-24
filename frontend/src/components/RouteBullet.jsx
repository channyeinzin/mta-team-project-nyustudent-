// The round line symbol you see in stations, e.g. a green (4) or grey (L).
// Colors come from the backend, so they match the official MTA colors.

const SIZES = {
  sm: "w-5 h-5 text-[10px]",
  md: "w-8 h-8 text-sm",
  lg: "w-11 h-11 text-lg",
};

export default function RouteBullet({ route, color = "#808183", textColor = "#FFFFFF", size = "md" }) {
  // "6X" (6 express) is shown as "6" — the MTA draws it as a diamond, we keep it simple.
  const label = route.replace("X", "");

  return (
    <span
      className={`${SIZES[size]} inline-flex shrink-0 items-center justify-center rounded-full font-bold`}
      style={{ backgroundColor: color, color: textColor }}
      title={`${route} train`}
    >
      {label}
    </span>
  );
}
