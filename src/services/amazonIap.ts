import { registerPlugin } from "@capacitor/core";

export type AmazonProduct = {
  sku: string;
  title: string;
  description: string;
  price: string;
  productType: string;
};

export type AmazonReceipt = {
  receiptId: string;
  sku: string;
  productType: string;
  purchaseDate?: number | null;
  cancelDate?: number | null;
};

type ProductDataResponseEvent = {
  requestId: string;
  status: string;
  products: AmazonProduct[];
};

type PurchaseResponseEvent = {
  requestId: string;
  status: string;
  userId?: string;
  marketplace?: string;
  receipt?: AmazonReceipt;
};

type PurchaseUpdatesResponseEvent = {
  requestId: string;
  status: string;
  hasMore: boolean;
  receipts: AmazonReceipt[];
  userId?: string;
  marketplace?: string;
};

type AmazonIapPlugin = {
  getProducts(options: { skus: string[] }): Promise<{ requestId: string }>;
  purchase(options: { sku: string }): Promise<{ requestId: string; status: string }>;
  restorePurchases(): Promise<{ requestId: string; status: string }>;

  addListener(
    eventName: "productDataResponse",
    listenerFunc: (event: ProductDataResponseEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;

  addListener(
    eventName: "purchaseResponse",
    listenerFunc: (event: PurchaseResponseEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;

  addListener(
    eventName: "purchaseUpdatesResponse",
    listenerFunc: (event: PurchaseUpdatesResponseEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;
};

export const AmazonIap = registerPlugin<AmazonIapPlugin>("AmazonIap");

export const AMAZON_SKUS = {
  monthly: "com.app4clients.allinonebilltracker.amazon.premium.monthly",
  yearly: "com.app4clients.allinonebilltracker.amazon.premium.yearly",
};