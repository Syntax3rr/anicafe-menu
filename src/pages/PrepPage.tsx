import { doc, FieldPath, updateDoc } from "firebase/firestore";
import { Chip, Group, Stack, Text } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { OrderCard } from "../components/OrderCard";
import { OrderGrid } from "../components/OrderGrid";
import { EmptyState, ErrorState, LoadingState } from "../components/StatusMessage";
import { db } from "../firebase";
import { useFlashIds } from "../hooks/useFlashIds";
import { useOpenOrders } from "../hooks/useOpenOrders";
import { MenuCategory } from "../types";
import { notifyError, stationCategories, stationNames } from "../utils";

const checkCategory = async (orderId: string, categoryName: string, value: boolean) => {
  try {
    // FieldPath preserves category names containing dots.
    await updateDoc(doc(db, "orders", orderId), new FieldPath("categories", categoryName, "done"), value);
  } catch (error) {
    notifyError(`Failed to update ${categoryName}`, error);
  }
};

export function PrepPage({ menu }: { menu: MenuCategory[] }) {
  const stations = stationNames(menu);
  const [savedStations, setSavedStations] = useLocalStorage<string[]>({
    key: "anicafe-prep-stations",
    defaultValue: [],
    getInitialValueInEffect: false,
  });
  // A station may have been removed since this device chose it. No selection shows every station.
  const selected = savedStations.filter((station) => stations.includes(station));
  const categories = stationCategories(menu, selected.length > 0 ? selected : stations);

  const { orders, error } = useOpenOrders();
  // Track all open orders so changing the selection doesn't flash existing orders as new.
  const { flashIds: newIds, dismiss } = useFlashIds(orders?.map((order) => order.id) ?? null, {
    durationMs: 10_000,
  });
  const shownOrders = orders?.filter((order) => categories.some((name) => name in order.categories)) ?? null;

  let content;
  if (error) content = <ErrorState title="Failed to load orders" message={error} />;
  else if (shownOrders === null) content = <LoadingState label="Loading orders..." />;
  else if (shownOrders.length === 0)
    content = (
      <EmptyState title="No open orders">
        {selected.length > 0
          ? `Orders for ${selected.join(", ")} will appear here.`
          : "Orders from the cashier will appear here."}
      </EmptyState>
    );
  else
    content = (
      <OrderGrid>
        {shownOrders.map((order) => (
          <OrderCard
            key={order.id}
            flash={newIds.has(order.id) ? "new" : undefined}
            onInteract={() => dismiss(order.id)}
            order={order}
            categories={categories}
            completeCategory={checkCategory}
          />
        ))}
      </OrderGrid>
    );

  return (
    <Stack>
      {stations.length > 1 && (
        <Group gap="sm">
          <Text fw={600}>Stations</Text>
          <Chip size="md" checked={selected.length === 0} onChange={() => setSavedStations([])}>
            All
          </Chip>
          <Chip.Group multiple value={selected} onChange={setSavedStations}>
            {stations.map((station) => (
              <Chip key={station} size="md" value={station}>
                {station}
              </Chip>
            ))}
          </Chip.Group>
        </Group>
      )}
      {content}
    </Stack>
  );
}
