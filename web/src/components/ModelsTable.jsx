import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table,
  TextInput,
  Select,
  Group,
  Text,
  Badge,
  CopyButton,
  ActionIcon,
  Tooltip,
  Center,
  Loader,
  Code,
  ScrollArea,
  Stack,
  Button,
} from "@mantine/core";
import { useInterval } from "@mantine/hooks";
import { fetchModels } from "../api.js";
import { notifications } from "@mantine/notifications";

// Live model list from Cloudflare (via /api/models). Cloudflare-hosted only
// (third-party/partner models excluded server-side), sorted newest-first.
// Read-only — CF is the source of truth, so there is no add/remove UI.
const TASK_COLORS = {
  "Text Generation": "blue",
  "Text Embeddings": "grape",
  "Text-to-Image": "pink",
  "Text-to-Speech": "orange",
  "Automatic Speech Recognition": "orange",
  Translation: "cyan",
  "Image-to-Text": "violet",
  "Text Classification": "teal",
};

export default function ModelsTable() {
  const [models, setModels] = useState(null);
  const [query, setQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const load = useCallback((fresh = false) => {
    return fetchModels(fresh)
      .then((r) => setModels(r.models))
      .catch((e) => {
        notifications.show({ title: "Model list failed", message: e.message, color: "red" });
        setModels([]);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Re-poll every 10 minutes (matches the backend cache TTL) so a newly
  // released CF model appears in the dashboard without a restart or refresh.
  const interval = useInterval(load, 10 * 60 * 1000);
  useEffect(() => { interval.start(); return interval.stop; }, [interval]);

  const [refreshing, setRefreshing] = useState(false);

  const tasks = useMemo(() => {
    if (!models) return [];
    return [...new Set(models.map((m) => m.task).filter(Boolean))].sort();
  }, [models]);

  const filtered = useMemo(() => {
    if (!models) return [];
    const q = query.trim().toLowerCase();
    let rows = models;
    if (taskFilter !== "all") rows = rows.filter((m) => m.task === taskFilter);
    if (q) {
      rows = rows.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.description || "").toLowerCase().includes(q)
      );
    }
    const newest = [...rows].sort((a, b) =>
      (b.created_at || "").localeCompare(a.created_at || "")
    );
    if (sortBy === "newest") return newest;
    if (sortBy === "oldest")
      return [...newest].reverse();
    if (sortBy === "name") return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "task")
      return [...rows].sort(
        (a, b) => (a.task || "").localeCompare(b.task || "") || a.name.localeCompare(b.name)
      );
    return newest;
  }, [models, query, taskFilter, sortBy]);

  if (models === null) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    );
  }

  // Badge models CF added within the last 30 days (by created_at). This is the
  // true "newly released by Cloudflare" signal — not a fixed top-N. The badge
  // disappears on its own as models age past the window, and appears on its own
  // when CF releases a fresh model.
  const NEW_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const isNew = (m) => {
    if (!m.created_at) return false;
    const t = Date.parse(m.created_at.replace(" ", "T") + "Z");
    return Number.isFinite(t) && now - t < NEW_MS;
  };

  const rows = filtered.map((m) => (
    <Table.Tr key={m.id}>
      <Table.Td>
        <Stack gap={4}>
          <Group gap="xs" wrap="nowrap">
            <Code>{m.name}</Code>
            {isNew(m) && (
              <Badge color="green" variant="filled" size="sm">
                NEW
              </Badge>
            )}
            <CopyButton value={m.name} timeout={1500}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? "Copied" : "Copy model id"} withArrow>
                  <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} onClick={copy}>
                    {copied ? "✓" : "⧉"}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
        </Stack>
      </Table.Td>
      <Table.Td>
        <Badge color={TASK_COLORS[m.task] || "gray"} variant="light" size="sm">
          {m.task || "—"}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Group gap={4}>
          {(m.capabilities || []).map((c) => (
            <Badge key={c} variant="dot" size="sm">
              {c}
            </Badge>
          ))}
        </Group>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed" lineClamp={2}>
          {m.description || "—"}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="xs" c="dimmed" ff="monospace">
          {m.created_at ? m.created_at.slice(0, 10) : "—"}
        </Text>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="wrap">
        <TextInput
          placeholder="Search model name / description"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          w={300}
        />
        <Group gap="sm">
          <Select
            data={[{ value: "all", label: "All tasks" }, ...tasks.map((t) => ({ value: t, label: t }))]}
            value={taskFilter}
            onChange={(v) => setTaskFilter(v || "all")}
            w={210}
          />
          <Select
            data={[
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
              { value: "name", label: "Name A–Z" },
              { value: "task", label: "By task" },
            ]}
            value={sortBy}
            onChange={setSortBy}
            w={150}
          />
          <Text size="sm" c="dimmed">
            {filtered.length} / {models.length}
          </Text>
          <Button
            variant="default"
            size="xs"
            loading={refreshing}
            onClick={async () => {
              setRefreshing(true);
              try { await load(true); } finally { setRefreshing(false); }
            }}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      <ScrollArea>
        <Table striped highlightOnHover withTableBorder minWidth={860}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Model ID</Table.Th>
              <Table.Th>Task</Table.Th>
              <Table.Th>Capabilities</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th>Added</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length > 0 ? (
              rows
            ) : (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Center p="lg">
                    <Text c="dimmed">No models (import accounts first, or none matched).</Text>
                  </Center>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}
