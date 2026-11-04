import { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { MenuCategory, Order } from "./types";

// Prices used to be stored as float dollars in `price` / `discount`. Read either format so
// a menu or orders saved before the switch to integer cents still work. Saving the menu
// from Edit Menu rewrites it in the new format.

const legacyCents = (dollars: unknown) => (typeof dollars === "number" ? Math.round(dollars * 100) : 0);

export const menuCategoryFromDoc = (snapshot: QueryDocumentSnapshot<DocumentData>): MenuCategory => {
  const data = snapshot.data();
  return {
    categoryName: data.categoryName,
    items: (data.items ?? []).map(({ price, ...item }: DocumentData) => ({
      ...item,
      priceCents: item.priceCents ?? legacyCents(price),
    })),
  };
};

export const orderFromDoc = (snapshot: QueryDocumentSnapshot<DocumentData>): Order => {
  const { price, discount, ...data } = snapshot.data();
  return {
    ...data,
    id: snapshot.id,
    totalCents: data.totalCents ?? legacyCents(price),
    discountCents: data.discountCents ?? legacyCents(discount),
  } as Order;
};
