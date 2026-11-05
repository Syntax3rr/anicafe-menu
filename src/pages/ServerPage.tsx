import { doc, updateDoc } from "firebase/firestore";
import { OrderCard } from "../components/OrderCard";
import { OrderGrid } from "../components/OrderGrid";
import { showUndoNotification } from "../components/undoNotification";
import { db } from "../firebase";
import { useOpenOrders } from "../hooks/useOpenOrders";
import { notifyError, SPECIALTY_CATEGORY } from "../utils";

/** Servers: see kitchen progress and mark orders delivered */
export function ServerPage() {
  const { orders, error } = useOpenOrders();

  const setCompleted = (orderId: string, completed: boolean) => updateDoc(doc(db, "orders", orderId), { completed });

  const completeOrder = async (orderId: string, orderNumber: number) => {
    try {
      await setCompleted(orderId, true);
      showUndoNotification(orderId, `Order #${orderNumber} completed!`, () => setCompleted(orderId, false));
    } catch (error) {
      notifyError(`Failed to complete order #${orderNumber}`, error);
    }
  };

  if (error) return <div>Failed to load orders: {error}</div>;
  if (orders === null) return <div>Loading orders...</div>;

  return (
    <OrderGrid>
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          excludeCategories={[SPECIALTY_CATEGORY]}
          completeOrder={() => completeOrder(order.id, order.number)}
          completeCategory="view"
        />
      ))}
    </OrderGrid>
  );
}
