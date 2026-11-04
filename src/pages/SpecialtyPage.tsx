import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
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

  // A specialty doc shares its ID with its parent order, so keep both in sync
  const setDone = (orderId: string, done: boolean) =>
    Promise.all([
      updateDoc(doc(db, "specialty", orderId), { done }),
      updateDoc(doc(db, "orders", orderId), { [`categories.${SPECIALTY_CATEGORY}.done`]: done }),
    ]);

  const completeSpecialtyOrder = async (orderId: string, orderNumber: number) => {
    await setDone(orderId, true);
    showUndoNotification(orderId + "specialty", `Specialty order #${orderNumber} completed!`, () =>
      setDone(orderId, false),
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
          completeOrder={() => completeSpecialtyOrder(specialty.id, specialty.number)}
        />
      ))}
    </OrderGrid>
  );
}
