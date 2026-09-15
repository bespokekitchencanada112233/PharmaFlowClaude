import { useStore } from "@/lib/store";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

export function PendingSyncBanner() {
  const { pendingCount, online, syncing, syncNow, pendingError, discardPending } = useStore();
  if (pendingCount === 0) return null;

  return (
    <div className="no-print flex flex-wrap items-center gap-3 bg-destructive/10 text-destructive border-b border-destructive/30 px-4 py-2 text-sm">
      <AlertTriangle className="size-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <strong>{pendingCount}</strong> change{pendingCount > 1 ? "s" : ""} not yet synced.
        {" "}Do not clear browser data until {online ? "sync completes" : "you reconnect"}.
        {pendingError && (
          <div className="text-xs opacity-80 mt-0.5 break-words">Last error: {pendingError}</div>
        )}
      </div>
      {online && !syncing && (
        <button
          onClick={() => syncNow()}
          className="inline-flex items-center gap-1.5 rounded-md bg-destructive text-destructive-foreground px-2.5 py-1 text-xs font-medium hover:opacity-90"
        >
          <RefreshCw className="size-3.5" />
          Sync now
        </button>
      )}
      {online && !syncing && pendingError && (
        <button
          onClick={() => {
            if (confirm("Discard the pending change(s) that cannot be synced? This cannot be undone.")) {
              discardPending();
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium hover:bg-destructive/10"
        >
          <Trash2 className="size-3.5" />
          Discard
        </button>
      )}
      {syncing && (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <RefreshCw className="size-3.5 animate-spin" />
          Syncing…
        </span>
      )}
    </div>
  );
}
