import { useEffect, useMemo, useState } from "react";
import { doc, writeBatch } from "firebase/firestore";
import { Button, Card, Group, List, NumberInput, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { db } from "../firebase";
import { MenuCategory, MenuItem, StockLevel } from "../types";

/** Flags are edited as a comma-separated string so typing commas works */
interface EditableMenuItem extends Omit<MenuItem, "flags"> {
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
    items: category.items.map(({ itemName, price, stock, flags }) => ({
      itemName,
      price,
      stock,
      flagsString: (flags ?? []).join(", "),
    })),
  }));

const fromEditable = (items: EditableMenuItem[]): MenuItem[] =>
  items.map(({ itemName, price, stock, flagsString }) => ({ itemName, price, stock, flags: parseFlags(flagsString) }));

export function EditMenuPage({ menu }: { menu: MenuCategory[] }) {
  const [editedMenu, setEditedMenu] = useState(() => toEditable(menu));

  useEffect(() => setEditedMenu(toEditable(menu)), [menu]);

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(editedMenu) !== JSON.stringify(toEditable(menu)),
    [editedMenu, menu],
  );

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
    try {
      const batch = writeBatch(db);
      for (const category of editedMenu) {
        batch.set(doc(db, "menu", category.categoryName), {
          categoryName: category.categoryName,
          items: fromEditable(category.items),
        });
      }
      await batch.commit();
      // The menu snapshot will reset editedMenu to the saved (normalized) version
      modals.open({ title: "Menu Saved", children: <p>Menu successfully updated!</p> });
    } catch (error) {
      console.error("Error saving menu:", error);
      modals.open({ title: "Error", children: <p>Failed to save menu. Check console for details.</p> });
    }
  };

  return (
    <Stack>
      <Card shadow="sm" radius="md" p="md">
        <Group justify="space-between">
          <Title order={2}>Edit Menu</Title>
          <Button onClick={handleSaveMenu} color={hasUnsavedChanges ? "yellow" : "blue"}>
            {hasUnsavedChanges ? "Save Changes *" : "Save Changes"}
          </Button>
        </Group>
      </Card>

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
                      decimalScale={2}
                      fixedDecimalScale
                      // NumberInput gives "" when cleared; never store a string price
                      onChange={(val) =>
                        handleItemChange(catIndex, itemIndex, "price", typeof val === "number" ? val : 0)
                      }
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
