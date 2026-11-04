import { doc, updateDoc } from "firebase/firestore";
import { OrderCard } from "../components/OrderCard";
import { OrderGrid } from "../components/OrderGrid";
import { showUndoNotification } from "../components/undoNotification";
import { db } from "../firebase";
import { useOpenOrders } from "../hooks/useOpenOrders";
import { SPECIALTY_CATEGORY } from "../utils";

/** Servers: see kitchen progress and mark orders delivered */
export function ServerPage() {
  const orders = useOpenOrders();

  const setCompleted = (orderId: string, completed: boolean) => updateDoc(doc(db, "orders", orderId), { completed });

  const completeOrder = async (orderId: string, orderNumber: number) => {
    await setCompleted(orderId, true);
    showUndoNotification(orderId, `Order #${orderNumber} completed!`, () => setCompleted(orderId, false));
  };

  return (
    <OrderGrid>
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          excludeCategories={[SPECIALTY_CATEGORY]}
          // id is always set on orders read from Firestore
          completeOrder={() => completeOrder(order.id!, order.number)}
          completeCategory="view"
        />
      ))}
    </OrderGrid>
  );
}
