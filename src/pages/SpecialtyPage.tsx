import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, where, writeBatch } from "firebase/firestore";
import { OrderCard } from "../components/OrderCard";
import { OrderGrid } from "../components/OrderGrid";
import { showUndoNotification } from "../components/undoNotification";
import { db } from "../firebase";
import { Specialty } from "../types";
import { notifySnapshotError, SPECIALTY_CATEGORY } from "../utils";

/** Specialty station: handles the Specialty category separately from the kitchen */
export function SpecialtyPage() {
  const [specialties, setSpecialties] = useState<Specialty[]>([]);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "specialty"), where("done", "==", false), orderBy("timestamp")),
        (snapshot) => setSpecialties(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Specialty)),
        notifySnapshotError("specialty orders"),
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
    await setDone(specialty, true);
    showUndoNotification(specialty.id + "specialty", `Specialty order #${specialty.number} completed!`, () =>
      setDone(specialty, false),
    );
  };

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
            price: 0,
            discount: 0,
            categories: { [SPECIALTY_CATEGORY]: { done: false, items: specialty.items } },
          }}
          completeOrder={() => completeSpecialtyOrder(specialty)}
        />
      ))}
    </OrderGrid>
  );
}
