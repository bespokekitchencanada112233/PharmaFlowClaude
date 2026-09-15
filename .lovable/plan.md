# Decimal quantities, return numbers, and more WhatsApp sending

## 1. Quantities shown with 2 decimals

Today quantities print raw, so 2.5 shows as "2.5" and 2 shows as "2". New rule: whole numbers stay clean (12), and fractional quantities always show exactly two decimals (12.50, 0.25).

Applied everywhere a quantity or stock level appears:
- Product list and stock report (stock, low-stock threshold)
- Invoice, purchase, return screens and their printed/PDF copies
- Product history and info card, dashboard and report tables

## 2. Serial numbers for returns

Returns currently show a code made from their internal ID (for example SR-4F2A9C1B). They will get real running numbers instead:
- Sales returns: SR-1001, SR-1002, ...
- Purchase returns: PR-1001, PR-1002, ...

Each type has its own counter (same style as invoices and purchases). Existing returns are numbered oldest-first so nothing is left blank, and the number shows in the returns list, the return page, the printed copy and the PDF.

## 3. Send a return on WhatsApp

The sales-return and purchase-return pages get a WhatsApp button next to Print/PDF, working exactly like the invoice one: it attaches the return PDF and pre-fills a message with the customer/supplier name, return number, date and amount. If the party has no saved phone number, it asks for one and saves it.

## 4. Send the quotation on WhatsApp

The Quotation tab in Reports gets a WhatsApp button. It builds a PDF of the quotation sheet currently shown (respecting the company filter), then lets you choose a saved customer or type any phone number, and sends the PDF with a short covering message.

## Technical notes

- Add `fmtQty(n)` in `src/lib/store.tsx`: 2 decimals when fractional, none when whole; replace raw qty/stock rendering across routes and `src/lib/pdf.ts`.
- Migration: add `number integer` to `public.sales_returns` and `public.purchase_returns`, plus `sales_return_counter` and `purchase_return_counter` on `company_settings`; backfill existing rows by `created_at` per user and set counters accordingly.
- Store: allocate the next number on create (mirroring the invoice/purchase counter flow, including the offline queue path), keep `SR-`/`PR-` prefixes in display, and fall back to the ID-based code if a number is missing.
- `buildReturnPdf` takes the new `refLabel` from the number; add `buildQuotationPdf` in `src/lib/pdf.ts` for the quotation sheet.
- Reuse `WhatsAppButton` for returns; for quotation add a small dialog for customer pick or manual number, reusing `normalizePhone` and `sendViaWhatsApp`.
