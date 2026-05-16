interface Props {
  strategy: string;
}

const labels: Record<string, string> = {
  bloat_no: "BLOAT NO",
  lay_draw: "LAY DRAW",
  pre_goal_back: "PRE-GOAL",
  spread_scalp: "SCALP",
  external_misprice: "EXT MISP",
  open_drift_favorite: "DRIFT",
  perplexity_overlay: "PERPLEX",
};

export function StrategyBadge({ strategy }: Props) {
  return (
    <span
      className={`badge-${strategy}`}
      style={{
        display: "inline-block",
        padding: "2px 6px",
        fontSize: 9,
        letterSpacing: "0.10em",
        fontFamily: "var(--mono)",
        borderRadius: 2,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {labels[strategy] ?? strategy}
    </span>
  );
}
