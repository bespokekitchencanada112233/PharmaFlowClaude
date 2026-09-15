import { useEffect, useState } from "react";
import { Palette, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type Theme = string; // built-in id or "custom:<name>"

const KEY = "ui-theme";
const CUSTOM_KEY = "ui-custom-themes";
const CUSTOM_CLASS = "theme-custom";

type CustomTheme = { name: string; bg: string; fg: string };

const BUILTINS: { id: string; label: string; swatch: string; description: string; cls: string | null }[] = [
  { id: "light", label: "White", swatch: "#ffffff", description: "Default bright", cls: null },
  { id: "blue", label: "Light Blue", swatch: "#e6f0fb", description: "Cool & calm", cls: "theme-blue" },
  { id: "sepia", label: "Sepia", swatch: "#f4ecd8", description: "Warm paper", cls: "theme-sepia" },
  { id: "mint", label: "Mint", swatch: "#e6f4ec", description: "Soft green", cls: "theme-mint" },
  { id: "lavender", label: "Lavender", swatch: "#efeafb", description: "Gentle purple", cls: "theme-lavender" },
  { id: "dark", label: "Dark", swatch: "#1a1a2e", description: "Low light", cls: "dark" },
];

const ALL_CLASSES = [...BUILTINS.map((b) => b.cls).filter(Boolean) as string[], CUSTOM_CLASS];

// Mix two hex colors. ratio 0 -> a, 1 -> b
function mix(a: string, b: string, ratio: number) {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  if (!pa || !pb) return a;
  const r = Math.round(pa.r + (pb.r - pa.r) * ratio);
  const g = Math.round(pa.g + (pb.g - pa.g) * ratio);
  const bl = Math.round(pa.b + (pb.b - pa.b) * ratio);
  return `rgb(${r} ${g} ${bl})`;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function loadCustoms(): CustomTheme[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveCustoms(list: CustomTheme[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
}

function applyCustomVars(bg: string, fg: string) {
  const root = document.documentElement;
  root.style.setProperty("--background", bg);
  root.style.setProperty("--foreground", fg);
  root.style.setProperty("--card", mix(bg, "#ffffff", 0.5));
  root.style.setProperty("--popover", mix(bg, "#ffffff", 0.5));
  root.style.setProperty("--secondary", mix(bg, fg, 0.08));
  root.style.setProperty("--muted", mix(bg, fg, 0.06));
  root.style.setProperty("--muted-foreground", mix(fg, bg, 0.35));
  root.style.setProperty("--border", mix(bg, fg, 0.15));
  root.style.setProperty("--input", mix(bg, fg, 0.12));
  root.style.setProperty("--card-foreground", fg);
  root.style.setProperty("--popover-foreground", fg);
  root.style.setProperty("--secondary-foreground", fg);
}

function clearCustomVars() {
  const root = document.documentElement;
  [
    "--background", "--foreground", "--card", "--popover", "--secondary",
    "--muted", "--muted-foreground", "--border", "--input",
    "--card-foreground", "--popover-foreground", "--secondary-foreground",
  ].forEach((v) => root.style.removeProperty(v));
}

function apply(theme: Theme, customs: CustomTheme[]) {
  const root = document.documentElement;
  ALL_CLASSES.forEach((cls) => root.classList.remove(cls));
  clearCustomVars();

  if (theme.startsWith("custom:")) {
    const name = theme.slice(7);
    const c = customs.find((x) => x.name === name);
    if (c) {
      root.classList.add(CUSTOM_CLASS);
      applyCustomVars(c.bg, c.fg);
      return;
    }
  }
  const b = BUILTINS.find((x) => x.id === theme);
  if (b?.cls) root.classList.add(b.cls);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [customs, setCustoms] = useState<CustomTheme[]>([]);

  useEffect(() => {
    const list = loadCustoms();
    setCustoms(list);
    const saved = (localStorage.getItem(KEY) as Theme | null) ?? "light";
    setThemeState(saved);
    apply(saved, list);
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    apply(next, customs);
    localStorage.setItem(KEY, next);
  };

  const addCustom = (c: CustomTheme) => {
    const next = [...customs.filter((x) => x.name !== c.name), c];
    setCustoms(next);
    saveCustoms(next);
    setThemeState(`custom:${c.name}`);
    apply(`custom:${c.name}`, next);
    localStorage.setItem(KEY, `custom:${c.name}`);
  };

  const removeCustom = (name: string) => {
    const next = customs.filter((x) => x.name !== name);
    setCustoms(next);
    saveCustoms(next);
    if (theme === `custom:${name}`) setTheme("light");
  };

  return { theme, setTheme, customs, addCustom, removeCustom };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, customs, addCustom, removeCustom } = useTheme();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("My Theme");
  const [bg, setBg] = useState("#eaf2fb");
  const [fg, setFg] = useState("#1a2238");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            title="Choose theme"
            className={cn(
              "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              className,
            )}
          >
            <Palette className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {BUILTINS.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <span
                className="size-4 rounded border border-border shrink-0"
                style={{ background: t.swatch }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm leading-tight">{t.label}</div>
                <div className="text-[11px] text-muted-foreground leading-tight">
                  {t.description}
                </div>
              </div>
              {theme === t.id && <Check className="size-4 text-accent" />}
            </DropdownMenuItem>
          ))}

          {customs.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                Custom
              </DropdownMenuLabel>
              {customs.map((c) => (
                <DropdownMenuItem
                  key={c.name}
                  onClick={() => setTheme(`custom:${c.name}`)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <span
                    className="size-4 rounded border border-border shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${c.bg} 50%, ${c.fg} 50%)`,
                    }}
                  />
                  <div className="flex-1 min-w-0 text-sm truncate">{c.name}</div>
                  {theme === `custom:${c.name}` && (
                    <Check className="size-4 text-accent" />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCustom(c.name);
                    }}
                    className="text-[11px] text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              setOpen(true);
            }}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Plus className="size-4" />
            <span className="text-sm">Create custom theme…</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Custom theme</DialogTitle>
            <DialogDescription>
              Pick a background and text color. Saved to this browser.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="theme-name">Name</Label>
              <Input
                id="theme-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="theme-bg">Background</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="theme-bg"
                    type="color"
                    value={bg}
                    onChange={(e) => setBg(e.target.value)}
                    className="h-9 w-12 rounded border border-input bg-transparent cursor-pointer"
                  />
                  <Input value={bg} onChange={(e) => setBg(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="theme-fg">Text</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="theme-fg"
                    type="color"
                    value={fg}
                    onChange={(e) => setFg(e.target.value)}
                    className="h-9 w-12 rounded border border-input bg-transparent cursor-pointer"
                  />
                  <Input value={fg} onChange={(e) => setFg(e.target.value)} />
                </div>
              </div>
            </div>
            <div
              className="rounded-md border border-border p-3 text-sm"
              style={{ background: bg, color: fg }}
            >
              Preview — the quick brown fox jumps over the lazy dog.
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const trimmed = name.trim() || "My Theme";
                addCustom({ name: trimmed, bg, fg });
                setOpen(false);
              }}
            >
              Save & apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
