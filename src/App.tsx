import { useEffect, useState } from "react";
import { collection, FirestoreError, onSnapshot, orderBy, query } from "firebase/firestore";
import { Tabs } from "@mantine/core";
import { db } from "./firebase";
import { menuCategoryFromDoc } from "./fromFirestore";
import { MenuCategory } from "./types";
import { AllOrdersPage } from "./pages/AllOrdersPage";
import { CashierPage } from "./pages/CashierPage";
import { EditMenuPage } from "./pages/EditMenuPage";
import { KitchenPage } from "./pages/KitchenPage";
import { ServerPage } from "./pages/ServerPage";
import { SpecialtyPage } from "./pages/SpecialtyPage";
import "./App.css";

function App() {
  const [menu, setMenu] = useState<MenuCategory[] | null>(null);
  const [loadError, setLoadError] = useState<FirestoreError | null>(null);

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

  if (loadError) return <div>Failed to load menu: {loadError.message}</div>;
  if (menu === null) return <div>Loading menu...</div>;

  return (
    <Tabs defaultValue="cashier" keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="cashier">Cashier</Tabs.Tab>
        <Tabs.Tab value="kitchen">Food/Drink</Tabs.Tab>
        <Tabs.Tab value="server">Servers</Tabs.Tab>
        <Tabs.Tab value="specialty">Specialty</Tabs.Tab>
        <Tabs.Tab value="editMenu">Edit Menu</Tabs.Tab>
        <Tabs.Tab value="allOrders">All Orders</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="cashier" keepMounted>
        <CashierPage menu={menu} />
      </Tabs.Panel>
      <Tabs.Panel value="kitchen">
        <KitchenPage />
      </Tabs.Panel>
      <Tabs.Panel value="server">
        <ServerPage />
      </Tabs.Panel>
      <Tabs.Panel value="specialty">
        <SpecialtyPage />
      </Tabs.Panel>
      <Tabs.Panel value="editMenu" keepMounted>
        <EditMenuPage menu={menu} />
      </Tabs.Panel>
      <Tabs.Panel value="allOrders">
        <AllOrdersPage menu={menu} />
      </Tabs.Panel>
    </Tabs>
  );
}

export default App;
