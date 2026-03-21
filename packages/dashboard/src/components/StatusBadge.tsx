const statusColors: Record<string, { bg: string; text: string }> = {
  running: { bg: "#064e3b", text: "#34d399" },
  building: { bg: "#1e3a5f", text: "#60a5fa" },
  generating: { bg: "#3b0764", text: "#c084fc" },
  deploying: { bg: "#1e3a5f", text: "#60a5fa" },
  pending: { bg: "#1a1a2e", text: "#888" },
  failed: { bg: "#450a0a", text: "#f87171" },
  stopped: { bg: "#1a1a2e", text: "#666" },
  none: { bg: "#1a1a2e", text: "#555" },
};

export default function StatusBadge({ status }: { status: string }) {
  const colors = statusColors[status] || statusColors.none;
  return (
    <span
      style={{
        padding: "0.2rem 0.6rem",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 500,
        background: colors.bg,
        color: colors.text,
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}
