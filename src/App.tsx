import { useEffect, useState } from "react";
import { collection, FirestoreError, onSnapshot, orderBy, query } from "firebase/firestore";
import { Group, Tabs, Title } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { db } from "./firebase";
import { menuCategoryFromDoc } from "./fromFirestore";
import { ColorSchemeToggle } from "./components/ColorSchemeToggle";
import { ErrorState, LoadingState } from "./components/StatusMessage";
import { useWakeLock } from "./hooks/useWakeLock";
import { MenuCategory } from "./types";
import { AllOrdersPage } from "./pages/AllOrdersPage";
import { CashierPage } from "./pages/CashierPage";
import { EditMenuPage } from "./pages/EditMenuPage";
import { ServerPage } from "./pages/ServerPage";
import { PrepPage } from "./pages/PrepPage";
import "./App.css";

const TABS = ["cashier", "prep", "server", "editMenu", "allOrders"];
const LEGACY_TABS: Record<string, string> = { kitchen: "prep", specialty: "prep" };

function App() {
  const [menu, setMenu] = useState<MenuCategory[] | null>(null);
  const [loadError, setLoadError] = useState<FirestoreError | null>(null);
  useWakeLock();
  const [tab, setTab] = useLocalStorage({
    key: "anicafe-tab",
    defaultValue: "cashier",
    getInitialValueInEffect: false,
  });

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "menu"), orderBy("categoryName")),
        (snapshot) => {
          setMenu(snapshot.docs.map(menuCategoryFromDoc));
          setLoadError(null);
        },
        (error) => {
          console.error("Error loading menu:", error);
          setLoadError(error);
        },
      ),
    [],
  );

  const activeTab = TABS.includes(tab) ? tab : (LEGACY_TABS[tab] ?? "cashier");

  let content;
  if (loadError) content = <ErrorState title="Failed to load menu" message={loadError.message} />;
  else if (menu === null) content = <LoadingState label="Loading menu..." />;
  else
    content = (
      <Tabs value={activeTab} onChange={(value) => value && setTab(value)} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="cashier">Cashier</Tabs.Tab>
          <Tabs.Tab value="prep">Prep</Tabs.Tab>
          <Tabs.Tab value="server">Servers</Tabs.Tab>
          <Tabs.Tab value="editMenu">Edit Menu</Tabs.Tab>
          <Tabs.Tab value="allOrders">All Orders</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="cashier" keepMounted>
          <CashierPage menu={menu} />
        </Tabs.Panel>
        <Tabs.Panel value="prep">
          <PrepPage menu={menu} />
        </Tabs.Panel>
        <Tabs.Panel value="server">
          <ServerPage />
        </Tabs.Panel>
        <Tabs.Panel value="editMenu" keepMounted>
          <EditMenuPage menu={menu} active={activeTab === "editMenu"} />
        </Tabs.Panel>
        <Tabs.Panel value="allOrders">
          <AllOrdersPage menu={menu} />
        </Tabs.Panel>
      </Tabs>
    );

  return (
    <>
      <Group justify="space-between" mb="sm">
        <Title order={3}>Anicafe</Title>
        <ColorSchemeToggle />
      </Group>
      {content}
    </>
  );
}

export default App;
