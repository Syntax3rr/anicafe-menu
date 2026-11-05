import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { orderFromDoc } from "../fromFirestore";
import { PersistedOrder } from "../types";
import { notifySnapshotError } from "../utils";

export function useOpenOrders() {
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<PersistedOrder[] | null>(null);

  useEffect(
    () =>
      onSnapshot(
        query(
          collection(db, "orders"),
          where("completed", "==", false),
          where("specialtyOnly", "==", false),
          orderBy("timestamp"),
        ),
        (snapshot) => { setOrders(snapshot.docs.map(orderFromDoc)); setError(null); },
        (error) => { setError(error.message); notifySnapshotError("orders")(error); },
      ),
    [],
  );

  return { orders, error };
}
