import { useState } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import {
  normalizePhone,
  renderTemplate,
  sendViaWhatsApp,
  WA_DEFAULTS,
} from "@/lib/whatsapp";

type Vars = Record<string, string | number>;

export type WhatsAppKind = "invoice" | "statement";

export function WhatsAppButton(props: {
  kind: WhatsAppKind;
  customerId?: string;
  supplierId?: string;
  vars: Vars;
  buildPdf: () => Blob | Promise<Blob>;
  fileName: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  iconOnly?: boolean;
  label?: string;
}) {
  const { db, updateCustomer, updateSupplier } = useStore();
  const party = props.supplierId
    ? db.suppliers.find((s) => s.id === props.supplierId)
    : db.customers.find((c) => c.id === props.customerId);
  const partyKind: "customer" | "supplier" = props.supplierId ? "supplier" : "customer";
  const cc = db.company.defaultCountryCode || "+92";
  const tpl =
    props.kind === "invoice"
      ? db.company.waInvoiceTemplate || WA_DEFAULTS.invoice
      : db.company.waStatementTemplate || WA_DEFAULTS.statement;


  const [busy, setBusy] = useState(false);
  const [askPhone, setAskPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");

  async function fire(rawPhone: string) {
    const intl = normalizePhone(rawPhone, cc);
    if (!intl) {
      toast.error("Invalid phone number");
      return;
    }
    setBusy(true);
    try {
      const pdf = await Promise.resolve(props.buildPdf());
      const message = renderTemplate(tpl, {
        ...props.vars,
        company: db.company.name,
      });
      const { mode } = await sendViaWhatsApp({
        phone: intl,
        message,
        pdf,
        fileName: props.fileName,
      });
      if (mode === "download") {
        toast.success("PDF downloaded — drop it into WhatsApp to send");
      }
    } catch (err) {
      console.error(err);
      toast.error("Could not prepare WhatsApp message");
    } finally {
      setBusy(false);
    }
  }

  function savePhone(id: string, phone: string) {
    if (partyKind === "supplier") updateSupplier(id, { phone });
    else updateCustomer(id, { phone });
  }

  function handleClick() {
    if (!party) return;
    const phone = party.phone?.trim();
    if (!phone) {
      setPhoneInput("");
      setAskPhone(true);
      return;
    }
    void fire(phone);
  }

  const partyWord = partyKind === "supplier" ? "Supplier" : "Customer";

  return (
    <>
      <Button
        variant={props.variant ?? "outline"}
        size={props.size}
        onClick={handleClick}
        disabled={busy || !party}
        title="Send on WhatsApp"
      >
        {busy ? (
          <Loader2 className="animate-spin" />
        ) : (
          <MessageCircle className="text-success" />
        )}
        {!props.iconOnly && (props.label ?? "WhatsApp")}
      </Button>

      <Dialog open={askPhone} onOpenChange={setAskPhone}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{partyWord} phone needed</DialogTitle>
            <DialogDescription>
              {party?.name} has no phone number saved. Enter one to send on
              WhatsApp. It will be saved to the {partyWord.toLowerCase()}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="wa-phone">Phone</Label>
            <Input
              id="wa-phone"
              autoFocus
              placeholder={`e.g. 0300 1234567 (defaults to ${cc})`}
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && phoneInput.trim()) {
                  setAskPhone(false);
                  if (party) savePhone(party.id, phoneInput.trim());
                  void fire(phoneInput.trim());
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAskPhone(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const v = phoneInput.trim();
                if (!v) return;
                setAskPhone(false);
                if (party) savePhone(party.id, v);
                void fire(v);
              }}
            >
              Save & send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

