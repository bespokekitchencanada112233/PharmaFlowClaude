import { useStore } from "@/lib/store";
import { Wifi, WifiOff, RefreshCw, CloudUpload } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConnectionStatus() {
  const { online, pendingCount, syncing, syncNow } = useStore();

  if (syncing) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium">
        <RefreshCw className="size-3.5 animate-spin" />
        Syncing {pendingCount > 0 && `${pendingCount}…`}
      </div>
    );
  }

  if (!online) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 text-warning px-2.5 py-1 text-xs font-medium">
        <WifiOff className="size-3.5" />
        Offline{pendingCount > 0 && ` · ${pendingCount} pending`}
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <button
        onClick={() => syncNow()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-accent/15 text-accent px-2.5 py-1 text-xs font-medium",
          "hover:bg-accent/25 transition-colors",
        )}
        title="Click to sync now"
      >
        <CloudUpload className="size-3.5" />
        {pendingCount} to sync
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-success/15 text-success px-2.5 py-1 text-xs font-medium">
      <Wifi className="size-3.5" />
      Online
    </div>
  );
}
