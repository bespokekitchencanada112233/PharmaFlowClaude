import { useState } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
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
import { buildSmsMessage, useSendSms, type SmsKind } from "@/lib/sms";

type Vars = Record<string, string | number | undefined>;

export function SmsButton(props: {
  kind: SmsKind;
  customerId: string;
  vars: Vars;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  iconOnly?: boolean;
  label?: string;
  silent?: boolean;
}) {
  const { db, updateCustomer } = useStore();
  const customer = db.customers.find((c) => c.id === props.customerId);
  const { send, pending } = useSendSms();
  const [askPhone, setAskPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");

  const smsEnabled = db.company.smsEnabled ?? false;
  const kindEnabled =
    props.kind === "invoice"
      ? (db.company.smsInvoiceEnabled ?? true)
      : (db.company.smsPaymentEnabled ?? true);

  async function fire(phone: string) {
    const message = buildSmsMessage(
      props.kind,
      {
        invoice: db.company.smsInvoiceTemplate,
        payment: db.company.smsPaymentTemplate,
      },
      db.company.name,
      props.vars,
    );
    const result = await send(phone, message, { silent: props.silent });
    if (result.ok && !props.silent) toast.success("SMS sent");
  }

  function handleClick() {
    if (!smsEnabled) {
      toast.warning("SMS is disabled. Enable it in Settings → SMS.");
      return;
    }
    if (!kindEnabled) {
      toast.warning(
        `${props.kind === "invoice" ? "Invoice" : "Payment"} SMS is turned off in Settings → SMS.`,
      );
      return;
    }
    if (!customer) return;
    const phone = customer.phone?.trim();
    if (!phone) {
      setPhoneInput("");
      setAskPhone(true);
      return;
    }
    void fire(phone);
  }

  return (
    <>
      <Button
        variant={props.variant ?? "outline"}
        size={props.size}
        onClick={handleClick}
        disabled={pending || !customer}
        title="Send SMS"
      >
        {pending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <MessageSquare className="text-accent" />
        )}
        {!props.iconOnly && (props.label ?? "SMS")}
      </Button>

      <Dialog open={askPhone} onOpenChange={setAskPhone}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Customer phone needed</DialogTitle>
            <DialogDescription>
              {customer?.name} has no phone number saved. Enter one to send an
              SMS. It will be saved to the customer.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="sms-phone">Phone</Label>
            <Input
              id="sms-phone"
              autoFocus
              placeholder={`e.g. 0300 1234567 (defaults to ${db.company.defaultCountryCode || "+92"})`}
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && phoneInput.trim()) {
                  const v = phoneInput.trim();
                  setAskPhone(false);
                  if (customer) updateCustomer(customer.id, { phone: v });
                  void fire(v);
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
                if (customer) updateCustomer(customer.id, { phone: v });
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
