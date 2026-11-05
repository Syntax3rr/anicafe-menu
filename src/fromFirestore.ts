import { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { MenuCategory, PersistedOrder } from "./types";

// Prices used to be stored as float dollars in `price` / `discount`. Documents saved that way
// may still exist, so read either format.

const legacyCents = (dollars: unknown) => (typeof dollars === "number" ? Math.round(dollars * 100) : 0);

/** Converts legacy `price` (dollars) to `priceCents`, preferring an existing `priceCents` */
const toCentsMenuItems = (items: DocumentData[] = []) =>
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
