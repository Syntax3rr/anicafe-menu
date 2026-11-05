import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { collection, FirestoreError, onSnapshot, orderBy, query } from "firebase/firestore";
import { Button, Group, Stack, Tabs, Text } from "@mantine/core";
import { AUTH_ENABLED, auth, db } from "./firebase";
import { menuCategoryFromDoc } from "./fromFirestore";
import { Role, useAuth } from "./hooks/useAuth";
import { MenuCategory } from "./types";
import { AllOrdersPage } from "./pages/AllOrdersPage";
import { CashierPage } from "./pages/CashierPage";
import { EditMenuPage } from "./pages/EditMenuPage";
import { KitchenPage } from "./pages/KitchenPage";
import { LoginPage } from "./pages/LoginPage";
import { ServerPage } from "./pages/ServerPage";
import { SpecialtyPage } from "./pages/SpecialtyPage";
import "./App.css";

const signOutButton = (
  <Button variant="subtle" size="xs" onClick={() => signOut(auth)}>
    Sign out
  </Button>
);

/**
 * The station tabs. With auth enabled it's only mounted once signed in, so its listeners never
 * run unauthenticated.
 */
function SignedInApp({ role }: { role: Role }) {
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

  const isAdmin = role === "admin";

  // Hiding tabs is only for convenience; firestore.rules is what blocks staff from admin actions
  return (
    <Tabs defaultValue="cashier" keepMounted={false}>
      <Group align="flex-end" wrap="nowrap">
        <Tabs.List style={{ flex: 1 }}>
          <Tabs.Tab value="cashier">Cashier</Tabs.Tab>
          <Tabs.Tab value="kitchen">Food/Drink</Tabs.Tab>
          <Tabs.Tab value="server">Servers</Tabs.Tab>
          <Tabs.Tab value="specialty">Specialty</Tabs.Tab>
          {isAdmin && <Tabs.Tab value="editMenu">Edit Menu</Tabs.Tab>}
          {isAdmin && <Tabs.Tab value="allOrders">All Orders</Tabs.Tab>}
        </Tabs.List>
        {AUTH_ENABLED && signOutButton}
      </Group>
      <Tabs.Panel value="cashier">
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
      {isAdmin && (
        <Tabs.Panel value="editMenu">
          <EditMenuPage menu={menu} />
        </Tabs.Panel>
      )}
      {isAdmin && (
        <Tabs.Panel value="allOrders">
          <AllOrdersPage menu={menu} />
        </Tabs.Panel>
      )}
    </Tabs>
  );
}

function AuthGate() {
  const { user, role, loading } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <LoginPage />;
  if (!role) {
    // Signed in, but not as one of the two shared accounts
    return (
      <Stack align="flex-start">
        <Text>{user.email} isn't a staff or organizer account.</Text>
        {signOutButton}
      </Stack>
    );
  }

  // Keyed by role so switching accounts remounts everything with fresh listeners
  return <SignedInApp key={role} role={role} />;
}

// Without auth every device gets full access, as before sign-in existed
const App = () => (AUTH_ENABLED ? <AuthGate /> : <SignedInApp role="admin" />);

export default App;
