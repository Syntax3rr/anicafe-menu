import { doc, FieldPath, updateDoc } from "firebase/firestore";
import { OrderCard } from "../components/OrderCard";
import { OrderGrid } from "../components/OrderGrid";
import { EmptyState, ErrorState, LoadingState } from "../components/StatusMessage";
import { db } from "../firebase";
import { useNewIds } from "../hooks/useNewIds";
import { useOpenOrders } from "../hooks/useOpenOrders";
import { notifyError, SPECIALTY_CATEGORY } from "../utils";

/** Food/Drink station: tick off each category of an order once it's prepared */
export function KitchenPage() {
  const { orders, error } = useOpenOrders();
  const newIds = useNewIds(orders?.map((order) => order.id) ?? null);

  const checkCategory = async (orderId: string, categoryName: string, value: boolean) => {
    try {
      // FieldPath instead of a dotted string so category names containing dots work
      await updateDoc(doc(db, "orders", orderId), new FieldPath("categories", categoryName, "done"), value);
    } catch (error) {
      notifyError(`Failed to update ${categoryName}`, error);
    }
  };

  if (error) return <ErrorState title="Failed to load orders" message={error} />;
  if (orders === null) return <LoadingState label="Loading orders..." />;
  if (orders.length === 0) return <EmptyState title="No open orders">New orders from the cashier will appear here.</EmptyState>;

  return (
    <OrderGrid>
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          isNew={newIds.has(order.id)}
          order={order}
          excludeCategories={[SPECIALTY_CATEGORY]}
          completeCategory={checkCategory}
        />
      ))}
    </OrderGrid>
  );
}
