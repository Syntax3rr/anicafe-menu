import { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { MenuCategory, PersistedOrder } from "./types";

// Prices used to be stored as float dollars in `price` / `discount`. migrateLegacyPrices.ts
// rewrites such documents in cents on app load; until it has, read either format.

export const legacyCents = (dollars: unknown) => (typeof dollars === "number" ? Math.round(dollars * 100) : 0);

export const hasLegacyMenuPrices = (data: DocumentData) =>
  (data.items ?? []).some((item: DocumentData) => item.priceCents === undefined || "price" in item);

export const hasLegacyOrderPrices = (data: DocumentData) =>
  data.totalCents === undefined || "price" in data || "discount" in data;

/** Converts legacy `price` (dollars) to `priceCents`, preferring an existing `priceCents` */
export const toCentsMenuItems = (items: DocumentData[] = []) =>
  items.map(({ price, ...item }) => ({ ...item, priceCents: item.priceCents ?? legacyCents(price) }));

export const menuCategoryFromDoc = (snapshot: QueryDocumentSnapshot<DocumentData>): MenuCategory => {
  const data = snapshot.data();
  return { categoryName: data.categoryName, items: toCentsMenuItems(data.items) } as MenuCategory;
};

export const orderFromDoc = (snapshot: QueryDocumentSnapshot<DocumentData>): PersistedOrder => {
  const { price, discount, ...data } = snapshot.data();
  return {
    ...data,
    id: snapshot.id,
    totalCents: data.totalCents ?? legacyCents(price),
    discountCents: data.discountCents ?? legacyCents(discount),
  } as PersistedOrder;
};
