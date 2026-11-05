# Anicafe Menu System

A small real-time ordering system for running a café-style event. A cashier takes orders on one device, and the orders show up on the other stations' screens right away (kitchen/bar, servers, specialty station). Everything syncs through Firebase Cloud Firestore.

The app is deployed to GitHub Pages at https://yuqiaoj.github.io/anicafe-menu/.

## Tabs / stations

| Tab            | Who uses it        | What it does                                                                                                                                                                           |
| -------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cashier**    | Front counter      | Builds an order from the menu (+/- per item) and takes an order number, an optional discount, a seating zone (Bar / Cashier / Stage / Volunteer / Undecided) and notes. A modal asks for confirmation before submitting. |
| **Food/Drink** | Kitchen / bar      | Live list of open orders (excluding the Specialty category). Staff tick off each category (e.g. Food, Drinks) once it's prepared.                                                       |
| **Servers**    | Floor staff        | The same open orders, read-only checkboxes, plus a **Complete** button once the order has been delivered. An 8-second toast offers **Undo**.                                              |
| **Specialty**  | Specialty station  | Open items from the `Specialty` category, handled separately from the regular kitchen. Completing one also marks the Specialty category as done on the parent order.                     |
| **Edit Menu**  | Organizers         | Edit item names, prices, stock level and dietary flags (NF, DF, GF, VG, `*` = contains pork), and add or remove items. Saves changed categories with conflict detection.                                 |
| **All Orders** | Organizers         | Sales analytics (total orders, items, revenue and quantity sold per item) and a full log of all orders.                                                                                |

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
  types.ts              Menu, order and specialty types
  utils.ts              Price formatting, zones, form-key escaping, error toasts
  hooks/useOpenOrders.ts  Live query shared by the Food/Drink and Servers tabs
  components/           OrderCard, OrderGrid, undo toast
  pages/                One file per tab (Cashier, Kitchen, Server, Specialty, EditMenu, AllOrders)
```

## Firestore data model

| Collection  | Document ID          | Shape                                                                                                                                                       |
| ----------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `menu`      | category name        | `{ categoryName, items: [{ itemName, priceCents, stock: "high" \| "low" \| "none", flags?: string[] }] }`                                                        |
| `orders`    | auto ID              | `{ number, totalCents, discountCents, notes, zone, completed, specialtyOnly, timestamp, categories: { [category]: { done, items: { [itemName]: { quantity } } } } }` |
| `specialty` | same ID as the order | `{ number, notes, done, specialtyOnly, timestamp, items: { [itemName]: { quantity } } }`                                                                                   |

All money is stored as integer cents. `totalCents` on an order is the total **after** the discount has been subtracted. Prices are still entered and shown in dollars. Data saved in the old format (float dollars in `price` / `discount`) is converted to cents when read. The migration helper in `src/migrateLegacyPrices.ts` is retained for a separately controlled migration.

Order numbers are entered by the cashier and can be reused once the earlier order is completed. If the number matches an order that's still open, the review modal shows a warning, but the cashier can still submit.

The category names `Specialty`, `Food` and `Drinks` are hard-coded in the UI: Specialty items are routed to the Specialty tab, and the All Orders table has a column for each of the three.

### Required composite indexes

The live queries combine filters with `orderBy`, so Firestore needs these composite indexes (if one is missing, the Firestore error in the browser console includes a link that creates it):

- `orders`: `completed` ASC, `specialtyOnly` ASC, `timestamp` ASC
- `specialty`: `done` ASC, `timestamp` ASC

## Setup

1. Create a Firebase project with Cloud Firestore enabled.
2. Create a `.env` file in the repo root with the web app config:

   ```env
   VITE_API_KEY=...
   VITE_AUTH_DOMAIN=...
   VITE_PROJECT_ID=...
   VITE_STORAGE_BUCKET=...
   VITE_MESSAGING_SENDER_ID=...
   VITE_APP_ID=...
   VITE_MEASUREMENT_ID=...
   ```

3. Seed the `menu` collection with at least one category document (see the data model above). The app shows "Loading menu..." until the menu snapshot arrives.
4. Install and run:

   ```sh
   npm install
   npm run dev
   ```

> **Security note:** the app has no authentication. Anyone who has the URL can read and write orders and edit the menu, unless your Firestore security rules restrict access. Set rules that fit your event before you deploy.

## Scripts

| Command           | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `npm run dev`     | Start the Vite dev server                                |
| `npm run build`   | Type-check (`tsc -b`) and build to `dist/`               |
| `npm run preview` | Serve the production build locally                       |
| `npm run lint`    | Run ESLint                                               |
| `npm run deploy`  | Build, then publish `dist/` to the `gh-pages` branch      |

The Vite `base` is set to `/anicafe-menu/` to match the GitHub Pages URL. Change it in `vite.config.ts` if you deploy somewhere else. The `.env` values are baked in at build time, so `npm run deploy` needs the `.env` file to be present.
