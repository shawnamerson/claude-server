const statusTooltips: Record<string, string> = {
  failed: "The app crashed. Check logs or chat with Claude to fix it.",
};

const statusConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  running:    { bg: "#064e3b", text: "#34d399", dot: "#34d399", label: "Live" },
  building:   { bg: "#1e3a5f", text: "#60a5fa", dot: "#60a5fa", label: "Building" },
  generating: { bg: "#3b0764", text: "#c084fc", dot: "#c084fc", label: "Generating" },
  deploying:  { bg: "#1e3a5f", text: "#60a5fa", dot: "#60a5fa", label: "Deploying" },
  pending:    { bg: "#1a1a2e", text: "#888",    dot: "#888",    label: "Pending" },
  failed:     { bg: "#450a0a", text: "#f87171", dot: "#f87171", label: "Error" },

  stopped:    { bg: "#1a1a2e", text: "#666",    dot: "#666",    label: "Stopped" },
  none:       { bg: "#1a1a2e", text: "#555",    dot: "#555",    label: "None" },
};

const pulsingStatuses = new Set(["generating", "building", "deploying"]);

export default function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.none;
  const shouldPulse = pulsingStatuses.has(status);
  const tooltip = statusTooltips[status];
  return (
    <>
      {shouldPulse && (
        <style>{`@keyframes statusPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      )}
      <span
        title={tooltip}
        style={{
          padding: "0.2rem 0.6rem",
          borderRadius: "9999px",
          fontSize: "0.75rem",
          fontWeight: 500,
          background: config.bg,
          color: config.text,
          display: "inline-flex",
          alignItems: "center",
          gap: "0.35rem",
          animation: shouldPulse ? "statusPulse 2s ease-in-out infinite" : undefined,
        }}
      >
        <span style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: config.dot,
          display: "inline-block",
        }} />
        {config.label}
      </span>
    </>
  );
}
