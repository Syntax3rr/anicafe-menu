import { Button, Group } from "@mantine/core";
import { hideNotification, notifications } from "@mantine/notifications";

/** Toast with an Undo button that runs `undo` and then dismisses itself */
export function showUndoNotification(id: string, message: string, undo: () => Promise<unknown>) {
  notifications.show({
    id,
    message: (
      <Group justify="space-between">
        {message}
        <Button
          variant="outline"
          onClick={async () => {
            await undo();
            hideNotification(id);
          }}
        >
          Undo
        </Button>
      </Group>
    ),
    autoClose: 8000,
  });
}
