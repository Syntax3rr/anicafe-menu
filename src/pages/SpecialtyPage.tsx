import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, orderBy, query, where, writeBatch } from "firebase/firestore";
import { OrderCard } from "../components/OrderCard";
import { OrderGrid } from "../components/OrderGrid";
import { EmptyState, ErrorState, LoadingState } from "../components/StatusMessage";
import { showUndoNotification } from "../components/undoNotification";
import { db } from "../firebase";
import { useFlashIds } from "../hooks/useFlashIds";
import { Specialty } from "../types";
import { isSpecialtyOnly, notifyError, notifySnapshotError, SPECIALTY_CATEGORY } from "../utils";

export function SpecialtyPage() {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[] | null>(null);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "specialty"), where("done", "==", false), orderBy("timestamp")),
        (snapshot) => setSpecialties(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Specialty)),
        (error) => {
          setLoadError(error.message);
          notifySnapshotError("specialty orders")(error);
        },
      ),
    [],
  );

  const { flashIds: newIds, dismiss } = useFlashIds(specialties?.map((specialty) => specialty.id) ?? null, {
    durationMs: 10_000,
  });

  // Specialty-only orders bypass the server station and must be completed here.
  const setDone = async ({ id, specialtyOnly }: Specialty, done: boolean) => {
    // Older specialty documents do not have this field.
    if (specialtyOnly === undefined) {
      const order = await getDoc(doc(db, "orders", id));
      specialtyOnly = order.exists() && isSpecialtyOnly(order.data().categories ?? {});
    }
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

  if (loadError) return <ErrorState title="Failed to load specialty orders" message={loadError} />;
  if (specialties === null) return <LoadingState label="Loading specialty orders..." />;
  if (specialties.length === 0)
    return <EmptyState title="No open specialty orders">Orders with specialty items will appear here.</EmptyState>;

  return (
    <OrderGrid>
      {specialties.map((specialty) => (
        <OrderCard
          key={specialty.id}
          flash={newIds.has(specialty.id) ? "new" : undefined}
          onInteract={() => dismiss(specialty.id)}
          order={{
            id: specialty.id,
            number: specialty.number,
            completed: specialty.done,
            notes: specialty.notes,
            timestamp: specialty.timestamp,
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
