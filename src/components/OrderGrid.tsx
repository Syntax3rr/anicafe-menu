import { ReactNode } from "react";
import { SimpleGrid } from "@mantine/core";

/** Responsive grid of order cards used by the station pages */
export function OrderGrid({ children }: { children: ReactNode }) {
  return (
    <SimpleGrid cols={{ sm: 2, lg: 3 }} spacing="sm" verticalSpacing="sm">
      {children}
    </SimpleGrid>
  );
}
