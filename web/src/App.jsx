import { useEffect, useState, useCallback } from "react";
import {
  AppShell,
  Group,
  Title,
  Badge,
  Button,
  Stack,
  Loader,
  Center,
  Text,
  Popover,
  PasswordInput,
  Tabs,
} from "@mantine/core";
import { useInterval } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import StatsCards from "./components/StatsCards.jsx";
import AccountsTable from "./components/AccountsTable.jsx";
import ModelsTable from "./components/ModelsTable.jsx";
import ImportButton from "./components/ImportButton.jsx";
import { fetchAccounts, getKey, setKey } from "./api.js";

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [keyInput, setKeyInput] = useState(getKey());
  const [keyOpen, setKeyOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchAccounts();
      setData(res);
    } catch (e) {
      notifications.show({ title: "Load failed", message: e.message, color: "red" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 10s.
  const interval = useInterval(load, 10000);
  useEffect(() => {
    interval.start();
    return interval.stop;
  }, [interval]);

  function saveKey() {
    setKey(keyInput.trim());
    setKeyOpen(false);
    setLoading(true);
    load();
    notifications.show({ title: "API key saved", message: "Reloading…", color: "blue" });
  }

  const stats = data?.stats;

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Title order={3}>cf-proxy</Title>
            {stats && (
              <Badge color={stats.available > 0 ? "teal" : "red"} variant="light" size="lg">
                {stats.available} / {stats.total} available
              </Badge>
            )}
          </Group>
          <Group>
            <Popover opened={keyOpen} onChange={setKeyOpen} width={300} position="bottom-end">
              <Popover.Target>
                <Button variant="default" onClick={() => setKeyOpen((o) => !o)}>
                  API key
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <Stack gap="xs">
                  <PasswordInput
                    label="Bearer API key"
                    description="Leave blank if the proxy has no auth"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.currentTarget.value)}
                  />
                  <Button onClick={saveKey} size="xs">
                    Save
                  </Button>
                </Stack>
              </Popover.Dropdown>
            </Popover>
            <ImportButton onDone={load} />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        {loading ? (
          <Center h={300}>
            <Loader />
          </Center>
        ) : (
          <Stack gap="lg">
            <StatsCards stats={stats} />
            <Tabs defaultValue="accounts">
              <Tabs.List mb="md">
                <Tabs.Tab value="accounts">Accounts</Tabs.Tab>
                <Tabs.Tab value="models">Models</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="accounts">
                <Group justify="flex-end" mb="xs">
                  <Text size="xs" c="dimmed">
                    auto-refreshes every 10s · neuron counts are estimates
                  </Text>
                </Group>
                <AccountsTable accounts={data?.accounts || []} />
              </Tabs.Panel>

              <Tabs.Panel value="models">
                <ModelsTable />
              </Tabs.Panel>
            </Tabs>
          </Stack>
        )}
      </AppShell.Main>
    </AppShell>
  );
}
