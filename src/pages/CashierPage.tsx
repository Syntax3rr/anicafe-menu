import { Fragment, useRef, useState } from "react";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import {
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
import { MenuCategory, Order, OrderCategory } from "../types";
import { formatPrice, fromFormKey, SPECIALTY_CATEGORY, toFormKey, ZONES } from "../utils";
import classes from "../App.module.css";

const MENU_COLUMNS = 2;

/** Quantities keyed by form key (see toFormKey): category -> item -> quantity */
type Quantities = Record<string, Record<string, number>>;

/** Writes the order and its specialty entry (if any) atomically, sharing one ID */
async function saveOrder(order: Order) {
  const specialty = order.categories[SPECIALTY_CATEGORY];
  const batch = writeBatch(db);
  const orderRef = doc(collection(db, "orders"));
  batch.set(orderRef, {
    ...order,
    timestamp: serverTimestamp(),
    specialtyOnly: specialty !== undefined && Object.keys(order.categories).length === 1,
  });
  if (specialty !== undefined) {
    batch.set(doc(db, "specialty", orderRef.id), {
      number: order.number,
      notes: order.notes,
      done: false,
      timestamp: serverTimestamp(),
      items: specialty.items,
    });
  }
  await batch.commit();
}

/** Converts form quantities to Order.categories, dropping zero quantities and empty categories */
function toOrderCategories(quantities: Quantities): Order["categories"] {
  const categories: Order["categories"] = {};
  for (const [categoryKey, items] of Object.entries(quantities)) {
    const category: OrderCategory = { done: false, items: {} };
    for (const [itemKey, quantity] of Object.entries(items)) {
      if (quantity > 0) category.items[fromFormKey(itemKey)] = { quantity };
    }
    if (Object.keys(category.items).length > 0) categories[fromFormKey(categoryKey)] = category;
  }
  return categories;
}

export function CashierPage({ menu }: { menu: MenuCategory[] }) {
  const [total, setTotal] = useState(0);
  const handlersRef = useRef<(NumberInputHandlers | null | undefined)[][]>(
    menu.map((category) => category.items.map(() => null)),
  );

  const priceOf: Quantities = Object.fromEntries(
    menu.map((category) => [
      toFormKey(category.categoryName),
      Object.fromEntries(category.items.map((item) => [toFormKey(item.itemName), item.price])),
    ]),
  );

  const calculateTotal = (quantities: Quantities) =>
    Object.entries(quantities).reduce(
      (sum, [categoryKey, items]) =>
        Object.entries(items).reduce((sum, [itemKey, quantity]) => sum + priceOf[categoryKey][itemKey] * quantity, sum),
      0,
    );

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      number: null as number | null,
      notes: "",
      discount: 0,
      zone: "Undecided",
      items: Object.fromEntries(
        menu.map((category) => [
          toFormKey(category.categoryName),
          Object.fromEntries(category.items.map((item) => [toFormKey(item.itemName), 0])),
        ]),
      ) as Quantities,
    },
    onValuesChange: (values) => setTotal(calculateTotal(values.items) - values.discount),
    validate: {
      number: (value: number | null) => (value && value > 0 ? null : "Order number is required"),
      discount: () => (total >= 0 ? null : "Discount greater than order total"),
    },
  });

  const handleSubmit = (values: typeof form.values) => {
    const order: Order = {
      number: values.number ?? 0, // never 0 thanks to validation
      price: total,
      discount: values.discount,
      notes: values.notes,
      completed: false,
      zone: values.zone,
      categories: toOrderCategories(values.items),
    };

    modals.openConfirmModal({
      title: "Review Order",
      children: (
        <Stack>
          <Text size="sm">Please confirm that the order details are correct:</Text>
          <OrderCard order={order} />
        </Stack>
      ),
      labels: { confirm: "Confirm", cancel: "Cancel" },
      onConfirm: async () => {
        try {
          await saveOrder(order);
          form.reset();
        } catch (error) {
          // Keep the form filled in so the cashier can retry
          console.error("Error submitting order:", error);
          notifications.show({
            color: "red",
            title: `Order #${order.number} was NOT saved`,
            message: "Check the connection and submit again.",
            autoClose: false,
          });
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
        {category.items.map((item, j) => {
          const itemKey = toFormKey(item.itemName);
          const formPath = `items.${categoryKey}.${itemKey}`;
          return (
            <Table.Tr key={item.itemName} className={classes.flexRow}>
              <Table.Td className={classes.flexGrow}>{item.itemName}</Table.Td>
              <Table.Td className={classes.cashPriceContainer}>{formatPrice(item.price)}</Table.Td>
              <Table.Td className={classes.numberButtonContainer}>
                <Button.Group>
                  {/* "-" and the count slide in once the quantity is above 0 */}
                  <Transition
                    mounted={form.getValues().items[categoryKey][itemKey] !== 0}
                    keepMounted
                    transition="slide-left"
                    duration={200}
                    timingFunction="ease"
                  >
                    {(styles) => (
                      <>
                        <Button variant="default" onClick={() => handlersRef.current[i][j]?.decrement()} style={styles}>
                          -
                        </Button>
                        <NumberInput
                          style={styles}
                          classNames={{ input: classes.numberButtonInput }}
                          hideControls
                          handlersRef={(el) => (handlersRef.current[i][j] = el)}
                          min={0}
                          max={99}
                          key={form.key(formPath)}
                          {...form.getInputProps(formPath)}
                        />
                      </>
                    )}
                  </Transition>
                  <Button variant="default" onClick={() => handlersRef.current[i][j]?.increment()}>
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
          <Group>
            <Text>Order Total: {formatPrice(total)}</Text>
            <Button type="submit">Submit</Button>
          </Group>
        </Card.Section>
      </form>
    </Card>
  );
}
