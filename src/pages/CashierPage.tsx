import { Fragment, useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  NumberInputHandlers,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Transition,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { OrderCard } from "../components/OrderCard";
import { db } from "../firebase";
import { orderFromDoc } from "../fromFirestore";
import { MenuCategory, MenuItem, Order, OrderCategory } from "../types";
import {
  formatCents,
  isSpecialtyOnly,
  notifySnapshotError,
  SPECIALTY_CATEGORY,
  toCents,
  toFormKey,
  ZONES,
} from "../utils";
import classes from "../App.module.css";

const MENU_COLUMNS = 2;

/** Quantities keyed by form key (see toFormKey): category -> item -> quantity */
type Quantities = Record<string, Record<string, number>>;

/** Writes the order and its specialty entry (if any) atomically, sharing one ID */
async function saveOrder(order: Order) {
  const specialty = order.categories[SPECIALTY_CATEGORY];
  const batch = writeBatch(db);
  const orderRef = doc(collection(db, "orders"));
  const specialtyOnly = isSpecialtyOnly(order.categories);
  batch.set(orderRef, { ...order, timestamp: serverTimestamp(), specialtyOnly });
  if (specialty !== undefined) {
    batch.set(doc(db, "specialty", orderRef.id), {
      number: order.number,
      notes: order.notes,
      done: false,
      specialtyOnly,
      timestamp: serverTimestamp(),
      items: specialty.items,
    });
  }
  await batch.commit();
}

/** Converts form quantities to Order.categories, dropping zero quantities and empty categories */
const emptyQuantities = (menu: MenuCategory[]): Quantities =>
  Object.fromEntries(
    menu.map((category) => [
      toFormKey(category.categoryName),
      Object.fromEntries(category.items.map((item) => [toFormKey(item.itemName), 0])),
    ]),
  );

const quantityOf = (quantities: Quantities, category: MenuCategory, item: MenuItem) =>
  quantities[toFormKey(category.categoryName)]?.[toFormKey(item.itemName)] ?? 0;

// Both helpers walk the current menu rather than the form values, so items removed from
// the menu mid-order (e.g. edited on another device) are dropped instead of priced as NaN

const calculateTotalCents = (menu: MenuCategory[], quantities: Quantities) =>
  menu.reduce(
    (sum, category) =>
      category.items.reduce((sum, item) => sum + item.priceCents * quantityOf(quantities, category, item), sum),
    0,
  );

/** Converts form quantities to Order.categories, dropping zero quantities and empty categories */
function toOrderCategories(menu: MenuCategory[], quantities: Quantities): Order["categories"] {
  const categories: Order["categories"] = {};
  for (const menuCategory of menu) {
    const category: OrderCategory = { done: false, items: {} };
    for (const item of menuCategory.items) {
      const quantity = quantityOf(quantities, menuCategory, item);
      if (quantity > 0) category.items[item.itemName] = { quantity };
    }
    if (Object.keys(category.items).length > 0) categories[menuCategory.categoryName] = category;
  }
  return categories;
}

const itemsError = (menu: MenuCategory[], quantities: Quantities) => {
  // An item can sell out while it's already in the order, and the input still accepts typing
  const soldOut = menu.flatMap((category) =>
    category.items.filter((item) => item.stock === "none" && quantityOf(quantities, category, item) > 0),
  );
  if (soldOut.length > 0) return `Sold out, remove from order: ${soldOut.map((item) => item.itemName).join(", ")}`;
  return Object.keys(toOrderCategories(menu, quantities)).length > 0 ? null : "Select at least one item";
};

const discountError = (menu: MenuCategory[], values: { items: Quantities; discount: number | string }) =>
  calculateTotalCents(menu, values.items) >= toCents(values.discount) ? null : "Discount greater than order total";

/**
 * Legacy specialty-only orders (from before `specialtyOnly` was stored) were never marked
 * completed, so treat them as closed once their specialty items are done
 */
const isEffectivelyOpen = (order: Order) =>
  !(order.specialtyOnly === undefined && isSpecialtyOnly(order.categories) && order.categories[SPECIALTY_CATEGORY].done);

/** Shown after the order is handed to Firestore, until the server confirms it */
const SLOW_SAVE_MS = 4000;

const DEFAULT_VALUES = {
  number: null as number | null,
  notes: "",
  /** Dollars, as typed; converted with toCents */
  discount: 0 as number | string,
  zone: "Undecided",
};

/**
 * Saves the order, showing its progress in a notification. Firestore queues the write and
 * retries until the server confirms it (the promise doesn't reject on a bad connection), so a
 * slow save must not be re-entered: it would arrive twice. It's held in memory only, though,
 * so the tab must stay open until it's sent.
 */
async function sendOrder(order: Order, restore: () => void) {
  const title = `Order #${order.number}`;
  const id = notifications.show({ loading: true, title: `Sending ${title}...`, message: "", autoClose: false, withCloseButton: false });
  const slowTimer = setTimeout(
    () =>
      notifications.update({
        id,
        color: "orange",
        title: `Still sending ${title}...`,
        message: "The connection is slow. Keep this tab open, and don't re-enter the order: it will go through once the connection recovers.",
      }),
    SLOW_SAVE_MS,
  );
  try {
    await saveOrder(order);
    notifications.update({ id, loading: false, color: "green", title: `${title} sent`, message: "", autoClose: 3000, withCloseButton: true });
  } catch (error) {
    // Rejected by the server (e.g. permissions), so nothing was saved
    console.error(`${title} was NOT saved`, error);
    notifications.update({
      id,
      loading: false,
      color: "red",
      title: `${title} was NOT saved`,
      message: (
        <Stack gap="xs" align="flex-start">
          <Text size="sm">{error instanceof Error ? error.message : "An unexpected error occurred."}</Text>
          <Button size="xs" color="red" variant="outline" onClick={() => { restore(); notifications.hide(id); }}>
            Put it back in the form (replaces what's there)
          </Button>
        </Stack>
      ),
      autoClose: false,
      withCloseButton: true,
    });
  } finally {
    clearTimeout(slowTimer);
  }
}

export function CashierPage({ menu }: { menu: MenuCategory[] }) {
  // Keyed by form path so the menu can change shape without breaking the lookups
  const handlersRef = useRef<Record<string, NumberInputHandlers | null | undefined>>({});

  const form = useForm({
    mode: "controlled",
    initialValues: { ...DEFAULT_VALUES, items: emptyQuantities(menu) },
    validate: {
      number: (value: number | null) => (value && value > 0 ? null : "Order number is required"),
      discount: (_: number | string, values: { items: Quantities; discount: number | string }) => discountError(menu, values),
      items: (value: Quantities) => itemsError(menu, value),
    },
  });

  // Keep the form in step with live menu edits: give new items a 0 quantity, make reset()
  // use the current menu, and re-price the order in case prices changed
  useEffect(() => {
    const { items } = form.getValues();
    for (const category of menu) {
      const categoryKey = toFormKey(category.categoryName);
      for (const item of category.items) {
        const itemKey = toFormKey(item.itemName);
        if (items[categoryKey]?.[itemKey] === undefined) form.setFieldValue(`items.${categoryKey}.${itemKey}`, 0);
      }
    }
    form.setInitialValues({ ...DEFAULT_VALUES, items: emptyQuantities(menu) });
    // Only re-run when the menu changes, not on every new `form` object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  const totalCents = calculateTotalCents(menu, form.values.items) - toCents(form.values.discount);

  // Quantities are edited at items.<category>.<item>, and Mantine only clears the error at that
  // exact path, so drop the order-level errors once a quantity (or menu) change resolves them
  const { items, discount } = form.values;
  useEffect(() => {
    if (form.errors.items && !itemsError(menu, items)) form.clearFieldError("items");
    if (form.errors.discount && !discountError(menu, { items, discount })) form.clearFieldError("discount");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, items]);

  // Order numbers are recycled, so only a still-open order with the same number is a duplicate.
  // Kept live (rather than queried on submit) so the check is instant, and this device's own
  // unconfirmed orders show up in it straight away.
  const [openOrders, setOpenOrders] = useState<Order[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "orders"), where("completed", "==", false)),
        (snapshot) => { setOpenOrders(snapshot.docs.map(orderFromDoc).filter(isEffectivelyOpen)); setOrdersError(null); },
        (error) => { setOrdersError(error.message); notifySnapshotError("open orders")(error); },
      ),
    [],
  );

  const handleSubmit = (values: typeof form.values) => {
    const order: Order = {
      number: values.number ?? 0, // never 0 thanks to validation
      totalCents: calculateTotalCents(menu, values.items) - toCents(values.discount),
      discountCents: toCents(values.discount),
      notes: values.notes,
      completed: false,
      zone: values.zone,
      categories: toOrderCategories(menu, values.items),
    };

    const duplicate = openOrders?.find((openOrder) => openOrder.number === order.number);
    // The timestamp is null until the server has confirmed the write
    const placedAt = duplicate?.timestamp?.toDate().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

    modals.openConfirmModal({
      title: "Review Order",
      children: (
        <Stack>
          {(ordersError || openOrders === null) && (
            <Alert color="orange" title="Duplicate check unavailable">Open orders could not be checked. Verify the order number before submitting.</Alert>
          )}
          {duplicate && (
            <Alert color="orange" title={`Order #${order.number} is already open`}>
              It was placed {placedAt ? `at ${placedAt}` : "just now"} and hasn't been completed. Only submit if you're
              sure this number is free.
            </Alert>
          )}
          <Text size="sm">Please confirm that the order details are correct:</Text>
          <OrderCard order={order} />
        </Stack>
      ),
      labels: { confirm: duplicate ? "Submit anyway" : "Confirm", cancel: "Cancel" },
      confirmProps: duplicate && { color: "orange" },
      onConfirm: () => {
        // Clear the form right away so the next order can be taken; the save is tracked in a
        // notification instead (see sendOrder)
        form.reset();
        void sendOrder(order, () => form.setValues(values));
      },
    });
  };

  const renderCategory = (category: MenuCategory, i: number) => {
    const categoryKey = toFormKey(category.categoryName);
    const isFirstRow = i < MENU_COLUMNS;
    return (
      <Fragment key={category.categoryName}>
        <Table.Tr style={{ display: "flex", padding: `${isFirstRow ? "0" : "12px"} 0 4px 0` }}>
          <Table.Td display="flex">
            <Title order={4}>{category.categoryName}</Title>
          </Table.Td>
        </Table.Tr>
        {category.items.map((item) => {
          const formPath = `items.${categoryKey}.${toFormKey(item.itemName)}`;
          const soldOut = item.stock === "none";
          return (
            <Table.Tr key={item.itemName} className={classes.flexRow}>
              <Table.Td className={classes.flexGrow}>
                <Group gap={6}>
                  <Text span td={soldOut ? "line-through" : undefined} c={soldOut ? "dimmed" : undefined}>
                    {item.itemName}
                  </Text>
                  {item.flags && item.flags.length > 0 && (
                    <Text span size="xs" c="dimmed">
                      {item.flags.join(", ")}
                    </Text>
                  )}
                  {soldOut && (
                    <Badge color="red" size="sm">
                      Sold out
                    </Badge>
                  )}
                  {item.stock === "low" && (
                    <Badge color="yellow" size="sm">
                      Low
                    </Badge>
                  )}
                </Group>
              </Table.Td>
              <Table.Td className={classes.cashPriceContainer}>{formatCents(item.priceCents)}</Table.Td>
              <Table.Td className={classes.numberButtonContainer}>
                <Button.Group>
                  {/* "-" and the count slide in once the quantity is above 0 */}
                  <Transition
                    mounted={quantityOf(form.getValues().items, category, item) !== 0}
                    keepMounted
                    transition="slide-left"
                    duration={200}
                    timingFunction="ease"
                  >
                    {(styles) => (
                      <>
                        <Button
                          variant="default"
                          onClick={() => handlersRef.current[formPath]?.decrement()}
                          style={styles}
                        >
                          -
                        </Button>
                        <NumberInput
                          style={styles}
                          classNames={{ input: classes.numberButtonInput }}
                          hideControls
                          handlersRef={(el) => (handlersRef.current[formPath] = el)}
                          min={0}
                          // Sold-out items can be reduced but not increased
                          max={soldOut ? quantityOf(form.getValues().items, category, item) : 99}
                          key={form.key(formPath)}
                          {...form.getInputProps(formPath)}
                        />
                      </>
                    )}
                  </Transition>
                  <Button
                    variant="default"
                    disabled={soldOut}
                    onClick={() => handlersRef.current[formPath]?.increment()}
                  >
                    +
                  </Button>
                </Button.Group>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Fragment>
    );
  };

  return (
    <Card shadow="sm" radius="md" p="md">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Card.Section withBorder>
          <Title order={2}>Create Order</Title>
        </Card.Section>
        <Card.Section withBorder>
          {/* Categories are dealt out left-to-right across the columns */}
          <SimpleGrid cols={MENU_COLUMNS}>
            {Array.from({ length: MENU_COLUMNS }, (_, column) => (
              <Table key={column}>
                <Table.Tbody>
                  {menu.map((category, i) => i % MENU_COLUMNS === column && renderCategory(category, i))}
                </Table.Tbody>
              </Table>
            ))}
          </SimpleGrid>
        </Card.Section>
        <Card.Section withBorder>
          <Group className={classes.cashOptions}>
            <NumberInput
              withAsterisk
              label="Order Number"
              hideControls
              min={1}
              key={form.key("number")}
              {...form.getInputProps("number")}
            />
            <NumberInput
              label="Apply Discount"
              min={0}
              key={form.key("discount")}
              decimalScale={2}
              fixedDecimalScale
              thousandSeparator=","
              prefix="$"
              {...form.getInputProps("discount")}
            />
            <Select
              label="Seating Zone"
              allowDeselect={false}
              data={ZONES}
              key={form.key("zone")}
              {...form.getInputProps("zone")}
            />
            <TextInput
              label="Notes"
              key={form.key("notes")}
              className={classes.flexGrow}
              {...form.getInputProps("notes")}
            />
          </Group>
        </Card.Section>
        <Card.Section className={classes.cashSubmit}>
          {form.errors.items && <Text c="red">{form.errors.items}</Text>}
          <Group>
            <Text>Order Total: {formatCents(totalCents)}</Text>
            <Button type="submit">Submit</Button>
          </Group>
        </Card.Section>
      </form>
    </Card>
  );
}
