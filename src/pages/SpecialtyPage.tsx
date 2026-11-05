import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, where, writeBatch } from "firebase/firestore";
import { OrderCard } from "../components/OrderCard";
import { OrderGrid } from "../components/OrderGrid";
import { showUndoNotification } from "../components/undoNotification";
import { db } from "../firebase";
import { Specialty } from "../types";
import { notifyError, notifySnapshotError, SPECIALTY_CATEGORY } from "../utils";

/** Specialty station: handles the Specialty category separately from the kitchen */
export function SpecialtyPage() {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[] | null>(null);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "specialty"), where("done", "==", false), orderBy("timestamp")),
        (snapshot) => setSpecialties(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Specialty)),
        (error) => { setLoadError(error.message); notifySnapshotError("specialty orders")(error); },
      ),
    [],
  );

  // A specialty doc shares its ID with its parent order, so keep both in sync. Specialty-only
  // orders never reach the Servers tab, so finishing the specialty finishes the whole order.
  const setDone = ({ id, specialtyOnly }: Specialty, done: boolean) => {
    const batch = writeBatch(db);
    batch.update(doc(db, "specialty", id), { done });
    batch.update(doc(db, "orders", id), {
      [`categories.${SPECIALTY_CATEGORY}.done`]: done,
      ...(specialtyOnly && { completed: done }),
    });
    return batch.commit();
  };

  const completeSpecialtyOrder = async (specialty: Specialty) => {
    try {
      await setDone(specialty, true);
      showUndoNotification(specialty.id + "specialty", `Specialty order #${specialty.number} completed!`, () =>
        setDone(specialty, false),
      );
    } catch (error) {
      notifyError(`Failed to complete specialty order #${specialty.number}`, error);
    }
  };

  if (loadError) return <div>Failed to load specialty orders: {loadError}</div>;
  if (specialties === null) return <div>Loading specialty orders...</div>;

  return (
    <OrderGrid>
      {specialties.map((specialty) => (
        <OrderCard
          key={specialty.id}
          order={{
            id: specialty.id,
            number: specialty.number,
            completed: specialty.done,
            notes: specialty.notes,
            totalCents: 0,
            discountCents: 0,
            categories: { [SPECIALTY_CATEGORY]: { done: false, items: specialty.items } },
          }}
          completeOrder={() => completeSpecialtyOrder(specialty)}
        />
      ))}
    </OrderGrid>
  );
}
