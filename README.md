# Anicafe Menu System

A small real-time ordering system for running a café-style event. A cashier takes orders on one device, and the orders show up on the other stations' screens right away (kitchen/bar, servers, specialty station). Everything syncs through Firebase Cloud Firestore.

The app is deployed to GitHub Pages at https://yuqiaoj.github.io/anicafe-menu/.

## Tabs / stations

| Tab            | Who uses it       | What it does                                                                                                                                                                                                             |
| -------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cashier**    | Front counter     | Builds an order from the menu (+/- per item) and takes an order number, an optional discount, a seating zone (Bar / Cashier / Stage / Volunteer / Undecided) and notes. A modal asks for confirmation before submitting. |
| **Food/Drink** | Kitchen / bar     | Live list of open orders (excluding the Specialty category). Staff tick off each category (e.g. Food, Drinks) once it's prepared.                                                                                        |
| **Servers**    | Floor staff       | The same open orders, read-only checkboxes, plus a **Complete** button once the order has been delivered. An 8-second toast offers **Undo**.                                                                             |
| **Specialty**  | Specialty station | Open items from the `Specialty` category, handled separately from the regular kitchen. Completing one also marks the Specialty category as done on the parent order.                                                     |
| **Edit Menu**  | Organizers        | Edit item names, prices, stock level and dietary flags (NF, DF, GF, VG, `*` = contains pork), and add or remove items. Saves changed categories with conflict detection.                                                 |
| **All Orders** | Organizers        | Sales analytics (total orders, items, revenue and quantity sold per item) and a full log of all orders.                                                                                                                  |

## Tech stack

- React 18 + TypeScript, built with Vite
- [Mantine 7](https://mantine.dev/) for UI (core, form, modals, notifications)
- Firebase Cloud Firestore for storage and live updates (`onSnapshot`)
- `gh-pages` for deployment

## Project structure

```
src/
  main.tsx              Entry point: Mantine, modal and notification providers
  App.tsx               Loads the menu and renders the station tabs
  firebase.ts           Firebase init (reads VITE_* env vars)
  hooks/useAuth.ts      Signed-in user and role (staff / admin)
  types.ts              Menu, order and specialty types
  utils.ts              Price formatting, zones, form-key escaping, error toasts
  hooks/useOpenOrders.ts  Live query shared by the Food/Drink and Servers tabs
  components/           OrderCard, OrderGrid, undo toast
  pages/                One file per tab (Cashier, Kitchen, Server, Specialty, EditMenu, AllOrders)
```

## Firestore data model

| Collection  | Document ID          | Shape                                                                                                                                                                |
| ----------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `menu`      | category name        | `{ categoryName, items: [{ itemName, priceCents, stock: "high" \| "low" \| "none", flags?: string[] }] }`                                                            |
| `orders`    | auto ID              | `{ number, totalCents, discountCents, notes, zone, completed, specialtyOnly, timestamp, categories: { [category]: { done, items: { [itemName]: { quantity } } } } }` |
| `specialty` | same ID as the order | `{ number, notes, done, specialtyOnly, timestamp, items: { [itemName]: { quantity } } }`                                                                             |

All money is stored as integer cents. `totalCents` on an order is the total **after** the discount has been subtracted. Prices are still entered and shown in dollars. Data saved in the old format (float dollars in `price` / `discount`) is converted to cents when read. The migration helper in `src/migrateLegacyPrices.ts` is retained for a separately controlled migration.

Order numbers are entered by the cashier and can be reused once the earlier order is completed. If the number matches an order that's still open, the review modal shows a warning, but the cashier can still submit.

The category names `Specialty`, `Food` and `Drinks` are hard-coded in the UI: Specialty items are routed to the Specialty tab, and the All Orders table has a column for each of the three.

### Required composite indexes

The live queries combine filters with `orderBy`, so Firestore needs these composite indexes. They're defined in `firestore.indexes.json` and deployed with `npm run deploy:rules`:

- `orders`: `completed` ASC, `specialtyOnly` ASC, `timestamp` ASC
- `specialty`: `done` ASC, `timestamp` ASC

## Setup

1. Create a Firebase project with Cloud Firestore and Authentication enabled.
2. Create a `.env` file in the repo root with the web app config:

   ```env
   VITE_API_KEY=...
   VITE_AUTH_DOMAIN=...
   VITE_PROJECT_ID=...
   VITE_STORAGE_BUCKET=...
   VITE_MESSAGING_SENDER_ID=...
   VITE_APP_ID=...
   VITE_MEASUREMENT_ID=...
   # Optional; see Authentication
   VITE_AUTH_ENABLED=false
   VITE_STAFF_EMAIL=staff@anicafe.app
   VITE_ADMIN_EMAIL=admin@anicafe.app
   ```

3. Optional: turn on sign-in (see [Authentication](#authentication)).
4. Seed the `menu` collection with at least one category document (see the data model above). The app shows "Loading menu..." until the menu snapshot arrives.
5. Install and run:

   ```sh
   npm install
   npm run dev
   ```

## Authentication

Sign-in is behind a feature flag and is **off by default**. With `VITE_AUTH_ENABLED` unset or `false`, there's no sign-in screen and every device can use every tab, the same as before sign-in existed. Set it to `true` and rebuild to turn sign-in on.

> **Deploy the rules and turn on the flag together.** `firestore.rules` only allows signed-in staff and organizer accounts. If those rules are deployed while the flag is off, the app can't read or write anything. If the flag is on but the rules haven't been deployed, sign-in works, but the database is still as open as its current rules allow.

With the flag on, every device signs in with one of two shared accounts, and stays signed in until someone taps **Sign out** or the password changes:

| Account   | Signs in as | Can use                                        |
| --------- | ----------- | ---------------------------------------------- |
| Staff     | "Staff"     | Cashier, Food/Drink, Servers, Specialty        |
| Organizer | "Organizer" | Everything, including Edit Menu and All Orders |

The sign-in screen only asks for the password; the account email comes from `.env`. **`firestore.rules` does the actual enforcement.** The hidden tabs are only for convenience: staff can't edit the menu or delete orders even through the Firestore API, and signed-out users or any other account can't read or write anything.

### One-time setup (by whoever owns the Firebase project)

1. In the Firebase console, go to **Authentication → Sign-in method** and enable **Email/Password**.
2. Under **Authentication → Users**, add two users with the emails from `.env` (they don't need to be real mailboxes). Choose strong passwords.
3. If you use different emails, update them in both `.env` and `firestore.rules`.
4. Optional: under **Authentication → Settings → User actions**, turn off **Enable create (sign-up)**. The rules only trust the two exact emails, so this is just extra protection.
5. Deploy the rules and indexes with `npm run deploy:rules`, and at the same time set `VITE_AUTH_ENABLED=true` and redeploy the app. `deploy:rules` reads the project ID from `.env`. The first time, run `npx firebase login`.

### Before each event

Change both passwords in the console. Changing a password revokes that account's sessions, so devices from the last event are signed out within about an hour, once their sign-in token expires. Only sign in as Organizer on devices the organizers control.

## Scripts

| Command                | Description                                                                    |
| ---------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`          | Start the Vite dev server                                                      |
| `npm run build`        | Type-check (`tsc -b`) and build to `dist/`                                     |
| `npm run preview`      | Serve the production build locally                                             |
| `npm run lint`         | Run ESLint                                                                     |
| `npm run deploy`       | Build, then publish `dist/` to the `gh-pages` branch                           |
| `npm run deploy:rules` | Deploy `firestore.rules` and `firestore.indexes.json` to the project in `.env` |
| `npm run test:rules`   | Test the security rules against the local Firestore emulator (needs Java)      |

The Vite `base` is set to `/anicafe-menu/` to match the GitHub Pages URL. Change it in `vite.config.ts` if you deploy somewhere else. The `.env` values are baked in at build time, so `npm run deploy` needs the `.env` file to be present.
