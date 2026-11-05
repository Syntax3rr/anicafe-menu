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
import { OrderCard } from "../components/OrderCard";
import { db } from "../firebase";
import { orderFromDoc } from "../fromFirestore";
import { MenuCategory, MenuItem, Order, OrderCategory } from "../types";
import { formatCents, notifyError, notifySnapshotError, SPECIALTY_CATEGORY, toCents, toFormKey, ZONES } from "../utils";
import classes from "../App.module.css";

const MENU_COLUMNS = 2;

/** Quantities keyed by form key (see toFormKey): category -> item -> quantity */
type Quantities = Record<string, Record<string, number>>;

/** Writes the order and its specialty entry (if any) atomically, sharing one ID */
async function saveOrder(order: Order) {
  const specialty = order.categories[SPECIALTY_CATEGORY];
  const batch = writeBatch(db);
  const orderRef = doc(collection(db, "orders"));
  const specialtyOnly = specialty !== undefined && Object.keys(order.categories).length === 1;
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

const DEFAULT_VALUES = {
  number: null as number | null,
  notes: "",
  /** Dollars, as typed; converted with toCents */
  discount: 0 as number | string,
  zone: "Undecided",
};

export function CashierPage({ menu }: { menu: MenuCategory[] }) {
  // Keyed by form path so the menu can change shape without breaking the lookups
  const handlersRef = useRef<Record<string, NumberInputHandlers | null | undefined>>({});

  const form = useForm({
    mode: "controlled",
    initialValues: { ...DEFAULT_VALUES, items: emptyQuantities(menu) },
    validate: {
      number: (value: number | null) => (value && value > 0 ? null : "Order number is required"),
      discount: (value: number | string, values: { items: Quantities }) => (calculateTotalCents(menu, values.items) >= toCents(value) ? null : "Discount greater than order total"),
      items: (value: Quantities) => Object.keys(toOrderCategories(menu, value)).length ? null : "Select at least one item",
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

  // Order numbers are recycled, so only a still-open order with the same number is a duplicate.
  // Kept live (rather than queried on submit) so the check is instant and works offline.
  const [openOrders, setOpenOrders] = useState<Order[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "orders"), where("completed", "==", false)),
        (snapshot) => { setOpenOrders(snapshot.docs.map(orderFromDoc)); setOrdersError(null); },
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
      onConfirm: async () => {
        try {
          await saveOrder(order);
          form.reset();
        } catch (error) {
          // Keep the form filled in so the cashier can retry
          notifyError(`Order #${order.number} was NOT saved`, error);
        }
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
                          max={99}
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
