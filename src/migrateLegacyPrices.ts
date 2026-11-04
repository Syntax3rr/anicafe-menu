import { collection, deleteField, doc, DocumentData, getDocs, runTransaction } from "firebase/firestore";
import { db } from "./firebase";
import { hasLegacyMenuPrices, hasLegacyOrderPrices, legacyCents, toCentsMenuItems } from "./fromFirestore";

// Prices used to be stored as float dollars in `price` / `discount`. This rewrites any such
// documents in integer cents. It runs once per app load, is a no-op once everything is
// migrated, and the readers in fromFirestore.ts still handle legacy data if it fails or
// hasn't run yet (e.g. when offline).

/**
 * Each document is re-read and rewritten in a transaction, so a menu edit or order update
 * made on another device after the initial read is never overwritten with stale data.
 */
async function migrateCollection(
  name: string,
  isLegacy: (data: DocumentData) => boolean,
  migrate: (data: DocumentData) => DocumentData,
) {
  const snapshot = await getDocs(collection(db, name));
  const legacyIds = snapshot.docs.filter((d) => isLegacy(d.data())).map((d) => d.id);
  await Promise.all(
    legacyIds.map((id) =>
      runTransaction(db, async (transaction) => {
        const ref = doc(db, name, id);
        const current = await transaction.get(ref);
        if (current.exists() && isLegacy(current.data())) transaction.update(ref, migrate(current.data()));
      }),
    ),
  );
  return legacyIds.length;
}

export async function migrateLegacyPrices() {
  try {
    const [menuDocs, orderDocs] = await Promise.all([
      migrateCollection("menu", hasLegacyMenuPrices, (data) => ({ items: toCentsMenuItems(data.items) })),
      migrateCollection("orders", hasLegacyOrderPrices, (data) => ({
        totalCents: data.totalCents ?? legacyCents(data.price),
        discountCents: data.discountCents ?? legacyCents(data.discount),
        price: deleteField(),
        discount: deleteField(),
      })),
    ]);
    if (menuDocs + orderDocs > 0) {
      console.info(`Migrated prices to cents in ${menuDocs} menu and ${orderDocs} order documents`);
    }
  } catch (error) {
    // Not fatal: legacy documents are still read correctly, and the next load retries
    console.error("Failed to migrate legacy prices:", error);
  }
}
