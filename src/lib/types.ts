export interface Customer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  area?: string;
  company?: string;
  openingBalance: number;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  company?: string;
  pack?: string;
  unit?: string;
  stock: number;
  purchasePrice: number;
  salePrice: number;
  lowStockThreshold: number;
  createdAt: string;
}

export interface InvoiceItem {
  productId: string;
  productName: string;
  qty: number;
  price: number;
}

export interface Invoice {
  id: string;
  number: number;
  customerId: string;
  customerName: string;
  date: string;
  items: InvoiceItem[];
  total: number;
  paid: number;
  notes?: string;
  updatedAt?: string;
}

export interface Payment {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  amount: number;
  method?: string;
  notes?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  area?: string;
  company?: string;
  openingBalance: number;
  createdAt: string;
}

export interface Purchase {
  id: string;
  number: number;
  supplierId: string;
  supplierName: string;
  date: string;
  items: InvoiceItem[];
  total: number;
  paid: number;
  notes?: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  amount: number;
  method?: string;
  notes?: string;
}

export interface PurchaseReturn {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  items: InvoiceItem[];
  total: number;
  notes?: string;
}

export interface SalesReturn {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  items: InvoiceItem[];
  total: number;
  notes?: string;
}

export type AppRole = "admin" | "salesman";

// Map: `${customerId}::${productId}` -> last sold price
export type LastPriceMap = Record<string, number>;

export interface DBShape {
  customers: Customer[];
  products: Product[];
  invoices: Invoice[];
  payments: Payment[];
  suppliers: Supplier[];
  purchases: Purchase[];
  supplierPayments: SupplierPayment[];
  purchaseReturns: PurchaseReturn[];
  salesReturns: SalesReturn[];
  lastPrices: LastPriceMap;
  invoiceCounter: number;
  purchaseCounter: number;
  company: {
    name: string;
    address: string;
    phone: string;
    waInvoiceTemplate?: string;
    waStatementTemplate?: string;
    defaultCountryCode?: string;
    smsEnabled?: boolean;
    smsInvoiceEnabled?: boolean;
    smsPaymentEnabled?: boolean;
    smsInvoiceTemplate?: string;
    smsPaymentTemplate?: string;
  };
}
