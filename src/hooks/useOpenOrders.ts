import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { orderFromDoc } from "../fromFirestore";
import { Order } from "../types";
import { notifySnapshotError } from "../utils";

/** Live list of incomplete orders that have something besides specialty items, oldest first */
export function useOpenOrders() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(
    () =>
      onSnapshot(
        query(
          collection(db, "orders"),
          where("completed", "==", false),
          where("specialtyOnly", "==", false),
          orderBy("timestamp"),
        ),
        (snapshot) => setOrders(snapshot.docs.map(orderFromDoc)),
        notifySnapshotError("orders"),
      ),
    [],
  );

  return orders;
}
