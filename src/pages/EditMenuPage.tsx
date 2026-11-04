import { useMemo, useState } from "react";
import { doc, writeBatch } from "firebase/firestore";
import {
  Alert,
  Button,
  Card,
  Group,
  List,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { db } from "../firebase";
import { MenuCategory, MenuItem, StockLevel } from "../types";
import { notifyError, toCents } from "../utils";

/**
 * Fields are kept as typed while editing and converted on save: the price in dollars
 * (a string while partially typed, e.g. "1."), flags as a comma-separated string
 */
interface EditableMenuItem extends Omit<MenuItem, "flags" | "priceCents"> {
  price: number | string;
  flagsString: string;
}

interface EditableMenuCategory {
  categoryName: string;
  items: EditableMenuItem[];
}

const FLAG_LEGEND = [
  ["NF", "Nut Free"],
  ["DF", "Dairy Free"],
  ["GF", "Gluten Free"],
  ["VG", "Vegan"],
  ["*", "Contains Pork (e.g. gelatin)"],
];

const STOCK_OPTIONS = [
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
  { value: "none", label: "None" },
];

const parseFlags = (flagsString: string) =>
  flagsString
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const toEditable = (menu: MenuCategory[]): EditableMenuCategory[] =>
  menu.map((category) => ({
    categoryName: category.categoryName,
    items: category.items.map(({ itemName, priceCents, stock, flags }) => ({
      itemName,
      price: priceCents / 100,
      stock,
      flagsString: (flags ?? []).join(", "),
    })),
  }));

const fromEditable = (items: EditableMenuItem[]): MenuItem[] =>
  items.map(({ itemName, price, stock, flagsString }) => ({
    itemName,
    priceCents: toCents(price),
    stock,
    flags: parseFlags(flagsString),
  }));

const sameMenu = (a: EditableMenuCategory[], b: EditableMenuCategory[]) => JSON.stringify(a) === JSON.stringify(b);

export function EditMenuPage({ menu }: { menu: MenuCategory[] }) {
  // The menu the current edits started from, so live updates don't wipe edits in progress
  const [baseMenu, setBaseMenu] = useState(menu);
  const [editedMenu, setEditedMenu] = useState(() => toEditable(menu));
  const [saving, setSaving] = useState(false);

  const hasUnsavedChanges = useMemo(() => !sameMenu(editedMenu, toEditable(baseMenu)), [editedMenu, baseMenu]);

  // Follow live menu updates while there's nothing to lose
  if (menu !== baseMenu && !hasUnsavedChanges) {
    setBaseMenu(menu);
    setEditedMenu(toEditable(menu));
  }

  const changedElsewhere = menu !== baseMenu && !saving && !sameMenu(toEditable(menu), toEditable(baseMenu));

  const discardEdits = () => {
    setBaseMenu(menu);
    setEditedMenu(toEditable(menu));
  };

  const updateItems = (catIndex: number, update: (items: EditableMenuItem[]) => EditableMenuItem[]) =>
    setEditedMenu((prev) =>
      prev.map((category, i) => (i === catIndex ? { ...category, items: update(category.items) } : category)),
    );

  const handleItemChange = <K extends keyof EditableMenuItem>(
    catIndex: number,
    itemIndex: number,
    field: K,
    value: EditableMenuItem[K],
  ) => updateItems(catIndex, (items) => items.map((item, j) => (j === itemIndex ? { ...item, [field]: value } : item)));

  const handleAddItem = (catIndex: number) =>
    updateItems(catIndex, (items) => [...items, { itemName: "New Item", price: 0, stock: "high", flagsString: "" }]);

  const handleRemoveItem = (catIndex: number, itemIndex: number) =>
    updateItems(catIndex, (items) => items.filter((_, j) => j !== itemIndex));

  const handleSaveMenu = async () => {
    const savedMenu: MenuCategory[] = editedMenu.map((category) => ({
      categoryName: category.categoryName,
      items: fromEditable(category.items),
    }));
    setSaving(true);
    try {
      const batch = writeBatch(db);
      for (const category of savedMenu) batch.set(doc(db, "menu", category.categoryName), category);
      await batch.commit();
      setBaseMenu(savedMenu);
      setEditedMenu(toEditable(savedMenu));
      modals.open({ title: "Menu Saved", children: <p>Menu successfully updated!</p> });
    } catch (error) {
      notifyError("Failed to save menu", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <Card shadow="sm" radius="md" p="md">
        <Group justify="space-between">
          <Title order={2}>Edit Menu</Title>
          <Button onClick={handleSaveMenu} loading={saving} color={hasUnsavedChanges ? "yellow" : "blue"}>
            {hasUnsavedChanges ? "Save Changes *" : "Save Changes"}
          </Button>
        </Group>
      </Card>

      {changedElsewhere && (
        <Alert color="orange" title="The menu was changed on another device">
          <Group justify="space-between">
            <Text size="sm">Saving now will overwrite those changes with yours.</Text>
            <Button size="xs" variant="outline" color="orange" onClick={discardEdits}>
              Discard my edits and load latest
            </Button>
          </Group>
        </Alert>
      )}

      <Card shadow="sm" radius="md" p="md" withBorder>
        <Title order={4} mb="xs">
          Flag Legend
        </Title>
        <List spacing="xs" size="sm" withPadding>
          {FLAG_LEGEND.map(([flag, meaning]) => (
            <List.Item key={flag}>
              <Text span fw={700}>
                {flag}
              </Text>{" "}
              – {meaning}
            </List.Item>
          ))}
        </List>
      </Card>

      {editedMenu.map((category, catIndex) => (
        <Card key={category.categoryName} shadow="sm" radius="md" p="md">
          <Group justify="space-between" mb="sm">
            <Title order={4}>{category.categoryName}</Title>
            <Button size="xs" onClick={() => handleAddItem(catIndex)}>
              + Add Item
            </Button>
          </Group>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Price</Table.Th>
                <Table.Th>Stock</Table.Th>
                <Table.Th>Flags (e.g. NF, GF, VG)</Table.Th>
                <Table.Th>Remove</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {category.items.map((item, itemIndex) => (
                <Table.Tr key={itemIndex}>
                  <Table.Td>
                    <TextInput
                      value={item.itemName}
                      onChange={(e) => handleItemChange(catIndex, itemIndex, "itemName", e.currentTarget.value)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      value={item.price}
                      min={0}
                      prefix="$"
                      decimalScale={2}
                      fixedDecimalScale
                      onChange={(val) => handleItemChange(catIndex, itemIndex, "price", val)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      value={item.stock}
                      data={STOCK_OPTIONS}
                      onChange={(val) => handleItemChange(catIndex, itemIndex, "stock", (val ?? "none") as StockLevel)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      value={item.flagsString}
                      onChange={(e) => handleItemChange(catIndex, itemIndex, "flagsString", e.currentTarget.value)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Button color="red" size="xs" onClick={() => handleRemoveItem(catIndex, itemIndex)}>
                      Remove
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      ))}
    </Stack>
  );
}
