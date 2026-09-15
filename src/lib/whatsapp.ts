// Utilities for sending invoices and statements via WhatsApp.
// Auto-detects whether the device supports native file-sharing (mobile).

const DEFAULT_INVOICE_TEMPLATE =
  "Dear {customer}, your invoice #{number} dated {date} for Rs {total} (Balance Rs {due}) is attached. — {company}";

const DEFAULT_STATEMENT_TEMPLATE =
  "Dear {customer}, your account statement up to {date} is attached. Closing balance: Rs {balance}. — {company}";

export const WA_DEFAULTS = {
  invoice: DEFAULT_INVOICE_TEMPLATE,
  statement: DEFAULT_STATEMENT_TEMPLATE,
};

/** Strip everything except digits and a leading +. Prepend default code if missing. */
export function normalizePhone(raw: string | undefined | null, defaultCC = "+92"): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[\s\-()]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) return "+" + s.slice(1).replace(/\D/g, "");
  // Strip leading 00 (international prefix in some regions)
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) return s.replace(/(?!^\+)\D/g, "");
  // Strip leading 0 (local trunk prefix)
  if (s.startsWith("0")) s = s.slice(1);
  s = s.replace(/\D/g, "");
  return defaultCC + s;
}

/** Phone in wa.me format: digits only, no +. */
export function waMeDigits(intl: string): string {
  return intl.replace(/\D/g, "");
}

export function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

export function isMobileShareSupported(file: File): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}

/**
 * Send a PDF + message via WhatsApp.
 *  - If the device supports sharing files, opens the native share sheet (mobile).
 *  - Otherwise downloads the PDF and opens wa.me with the message pre-filled (desktop).
 */
export async function sendViaWhatsApp(opts: {
  phone: string; // already normalized to +<intl>
  message: string;
  pdf: Blob;
  fileName: string;
}): Promise<{ mode: "share" | "download" }> {
  const file = new File([opts.pdf], opts.fileName, { type: "application/pdf" });

  if (isMobileShareSupported(file)) {
    try {
      await navigator.share({
        files: [file],
        text: opts.message,
        title: opts.fileName,
      });
      return { mode: "share" };
    } catch (err: unknown) {
      // User cancelled — bail quietly
      if (err instanceof Error && err.name === "AbortError") {
        return { mode: "share" };
      }
      // Fall through to download path on any other failure
    }
  }

  // Desktop / fallback: download the PDF + open wa.me
  const url = URL.createObjectURL(opts.pdf);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const wa = `https://wa.me/${waMeDigits(opts.phone)}?text=${encodeURIComponent(opts.message)}`;
  window.open(wa, "_blank", "noopener");
  return { mode: "download" };
}
