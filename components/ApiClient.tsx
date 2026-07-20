"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Box,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Quote,
  Code2,
  Link2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  FileJson,
  Folder,
  FolderOpen,
  Library,
  LoaderCircle,
  LogOut,
  Menu as MenuIcon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Save,
  Send,
  Settings2,
  Star,
  Upload,
  UserRound,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { getRepository } from "@/lib/repository";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  exportPostmanCollection,
  importPostmanCollection,
} from "@/src/lib/postman";
import { newId } from "@/src/lib/id";
import type {
  ApiRequest,
  ApiResponse,
  BodyMode,
  Collection,
  Environment,
  Folder as FolderType,
  HttpMethod,
  KeyValue,
  Workspace,
  WorkspaceInvite,
} from "@/src/types";
import type { Repository } from "@/src/data/repository";
import BrandLogo from "./BrandLogo";
import WorkspacePeople, { PendingInvites } from "./WorkspacePeople";
import ThemeToggle from "./ThemeToggle";
import { useAppDialog } from "./AppDialog";

const methods: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];
const emptyRequest = (
  collectionId: string,
  folderId: string | null,
  name: string,
): ApiRequest => ({
  id: newId(),
  collectionId,
  folderId,
  name,
  method: "GET",
  url: "",
  params: [],
  headers: [],
  bodyMode: "none",
  bodyRaw: "",
  bodyForm: [],
  auth: { type: "none" },
  createdAt: new Date().toISOString(),
});
const pretty = (value: string) => {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};
const jsonTokens = (value: string) => {
  try {
    const formatted = JSON.stringify(JSON.parse(value), null, 2);
    const pattern =
      /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:?)|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    const result: React.ReactNode[] = [];
    let cursor = 0;
    for (const match of formatted.matchAll(pattern)) {
      const index = match.index ?? 0;
      if (index > cursor) result.push(formatted.slice(cursor, index));
      const token = match[0];
      const type = token.trimEnd().endsWith(":")
        ? "key"
        : token.startsWith('"')
          ? "string"
          : /true|false/.test(token)
            ? "boolean"
            : token === "null"
              ? "null"
              : "number";
      result.push(
        <span className={`json-${type}`} key={`${index}-${token}`}>
          {token}
        </span>,
      );
      cursor = index + token.length;
    }
    if (cursor < formatted.length) result.push(formatted.slice(cursor));
    return result;
  } catch {
    return null;
  }
};
const sourceJsonTokens = (value: string) => {
  const pattern =
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:?)|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const result: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) result.push(value.slice(cursor, index));
    const token = match[0];
    const type = token.trimEnd().endsWith(":")
      ? "key"
      : token.startsWith('"')
        ? "string"
        : /true|false/.test(token)
          ? "boolean"
          : token === "null"
            ? "null"
            : "number";
    result.push(
      <span className={`json-${type}`} key={`${index}-${token}`}>
        {token}
      </span>,
    );
    cursor = index + token.length;
  }
  if (cursor < value.length) result.push(value.slice(cursor));
  return result;
};
const requestVariableNames = (request: ApiRequest) => {
  const values = [
    request.url,
    request.bodyRaw,
    ...request.params.flatMap((item) => [item.key, item.value]),
    ...request.headers.flatMap((item) => [item.key, item.value]),
    ...request.bodyForm.flatMap((item) => [item.key, item.value]),
    request.auth.bearerToken ?? "",
    request.auth.basicUsername ?? "",
    request.auth.basicPassword ?? "",
  ];
  const names = new Set<string>();
  values.forEach((value) => {
    for (const match of value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g))
      names.add(match[1]);
  });
  return [...names];
};
const bytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
const starredFirst = (a: FolderType, b: FolderType) =>
  Number(b.isStarred) - Number(a.isStarred) || a.name.localeCompare(b.name);
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
const createCurl = (request: ApiRequest, variables: KeyValue[] = []) => {
  const values = new Map(
    variables
      .filter((item) => item.enabled && item.key)
      .map((item) => [item.key, item.value]),
  );
  const resolve = (value = "") =>
    value.replace(
      /\{\{\s*([^{}]+?)\s*\}\}/g,
      (match, key: string) => values.get(key) ?? match,
    );
  let url = resolve(request.url.trim());
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const params = request.params
    .filter((item) => item.enabled && item.key)
    .map((item) => [resolve(item.key), resolve(item.value)]);
  if (params.length)
    url += `${url.includes("?") ? "&" : "?"}${new URLSearchParams(params).toString()}`;
  const headers = request.headers
    .filter((item) => item.enabled && item.key)
    .map((item) => [resolve(item.key), resolve(item.value)] as const);
  if (request.auth.type === "bearer" && request.auth.bearerToken)
    headers.push([
      "Authorization",
      `Bearer ${resolve(request.auth.bearerToken)}`,
    ]);
  if (request.auth.type === "basic")
    headers.push([
      "Authorization",
      `Basic ${btoa(`${resolve(request.auth.basicUsername)}:${resolve(request.auth.basicPassword)}`)}`,
    ]);
  let body = "";
  if (!["GET", "HEAD"].includes(request.method)) {
    if (request.bodyMode === "json" || request.bodyMode === "raw")
      body = resolve(request.bodyRaw);
    if (request.bodyMode === "form")
      body = new URLSearchParams(
        request.bodyForm
          .filter((item) => item.enabled && item.key)
          .map((item) => [resolve(item.key), resolve(item.value)]),
      ).toString();
    if (
      request.bodyMode === "json" &&
      !headers.some(([key]) => key.toLowerCase() === "content-type")
    )
      headers.push(["Content-Type", "application/json"]);
    if (
      request.bodyMode === "form" &&
      !headers.some(([key]) => key.toLowerCase() === "content-type")
    )
      headers.push(["Content-Type", "application/x-www-form-urlencoded"]);
  }
  const parts = [
    `curl --request ${request.method} --url ${shellQuote(url)}`,
    ...headers.map(
      ([key, value]) => `  --header ${shellQuote(`${key}: ${value}`)}`,
    ),
  ];
  if (body) parts.push(`  --data ${shellQuote(body)}`);
  return parts.join(" \\\n");
};

function KeyValueEditor({
  value,
  onChange,
  keyLabel = "Key",
}: {
  value: KeyValue[];
  onChange: (value: KeyValue[]) => void;
  keyLabel?: string;
}) {
  const patch = (id: string, update: Partial<KeyValue>) =>
    onChange(
      value.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  return (
    <>
      <div className="kv-list">
        {value.map((item) => (
          <div className="kv-row" key={item.id}>
            <input
              className="check"
              type="checkbox"
              aria-label={`Enable ${item.key || keyLabel}`}
              checked={item.enabled}
              onChange={(e) => patch(item.id, { enabled: e.target.checked })}
            />
            <input
              aria-label={keyLabel}
              placeholder={keyLabel}
              value={item.key}
              onChange={(e) => patch(item.id, { key: e.target.value })}
            />
            <input
              aria-label="Value"
              placeholder="Value"
              value={item.value}
              onChange={(e) => patch(item.id, { value: e.target.value })}
            />
            <button
              className="icon-button compact"
              aria-label="Remove row"
              onClick={() =>
                onChange(value.filter((row) => row.id !== item.id))
              }
            >
              <X size={15} />
            </button>
          </div>
        ))}
        <button
          className="text-button"
          onClick={() =>
            onChange([
              ...value,
              { id: newId(), key: "", value: "", enabled: true },
            ])
          }
        >
          <Plus size={15} /> Add row
        </button>
      </div>
      {keyLabel === "Header" && <GeneratedHeaders />}
    </>
  );
}

function GeneratedHeaders() {
  const [visible, setVisible] = useState(true);
  const headers = [
    ["Cache-Control", "no-cache"],
    ["Postman-Token", "<calculated when request is sent>"],
    ["Content-Type", "<calculated from body type>"],
    ["Content-Length", "<calculated when request is sent>"],
    ["Host", "<calculated from request URL>"],
    ["User-Agent", "PostmanRuntime/7.54.0"],
    ["Accept", "*/*"],
    ["Accept-Encoding", "gzip, deflate, br"],
    ["Connection", "keep-alive"],
  ];
  return (
    <section className="generated-headers">
      <button
        className="generated-toggle"
        aria-expanded={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? "Hide" : "Show"} auto-generated headers{" "}
        <span>{headers.length}</span>
      </button>
      {visible && (
        <div
          className="generated-table"
          role="table"
          aria-label="Auto-generated request headers"
        >
          <div className="generated-head" role="row">
            <span>Key</span>
            <span>Value</span>
          </div>
          {headers.map(([key, value]) => (
            <div className="generated-row" role="row" key={key}>
              <strong role="cell">{key}</strong>
              <code role="cell">{value}</code>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ApiClient({
  userId,
  userEmail,
  isAdmin = false,
}: {
  userId: string;
  userEmail: string;
  isAdmin?: boolean;
}) {
  const { ask, confirm: confirmDialog, dialog } = useAppDialog();
  const configured = isSupabaseConfigured();
  const repo = configured ? getRepository() : null;
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [requests, setRequests] = useState<ApiRequest[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [request, setRequest] = useState<ApiRequest | null>(null);
  const [requestTab, setRequestTab] = useState<
    "Docs" | "Params" | "Headers" | "Body" | "Auth"
  >("Params");
  const [responseTab, setResponseTab] = useState<"Body" | "Headers">("Body");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [responseHeight, setResponseHeight] = useState(360);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [busyLabel, setBusyLabel] = useState("");
  const [busyProgress, setBusyProgress] = useState<number | null>(null);
  const [mobilePanel, setMobilePanel] = useState<
    "workspaces" | "collections" | null
  >(null);
  const [pendingInvites, setPendingInvites] = useState<WorkspaceInvite[]>([]);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState("");
  const [environmentsOpen, setEnvironmentsOpen] = useState(false);
  const [resourcePaneOpen, setResourcePaneOpen] = useState(true);
  const [collectionsWidth, setCollectionsWidth] = useState(310);
  const [curlOpen, setCurlOpen] = useState(false);
  const [documentationTarget, setDocumentationTarget] = useState<Collection | FolderType | ApiRequest | null>(null);
  const [workspacesOpen, setWorkspacesOpen] = useState(true);
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(
    new Set(),
  );
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const resizeCollections = (event: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth <= 900) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = collectionsWidth;
    const target = event.currentTarget;
    const onMove = (moveEvent: PointerEvent) =>
      setCollectionsWidth(
        Math.min(620, Math.max(230, startWidth + moveEvent.clientX - startX)),
      );
    const onEnd = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onEnd);
      target.removeEventListener("pointercancel", onEnd);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onEnd);
    target.addEventListener("pointercancel", onEnd);
  };
  const resizeResponse = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = event.currentTarget;
    const startY = event.clientY;
    const startHeight = responseHeight;
    target.setPointerCapture(event.pointerId);
    const onMove = (moveEvent: PointerEvent) => {
      const maximum = Math.max(220, window.innerHeight - 150);
      setResponseHeight(
        Math.min(
          maximum,
          Math.max(180, startHeight + startY - moveEvent.clientY),
        ),
      );
    };
    const onEnd = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onEnd);
      target.removeEventListener("pointercancel", onEnd);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onEnd);
    target.addEventListener("pointercancel", onEnd);
  };

  const notify = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 3500);
  };
  const loadWorkspaces = useCallback(async () => {
    if (repo) setWorkspaces(await repo.listWorkspaces());
  }, [repo]);
  const loadPendingInvites = useCallback(async () => {
    if (repo) setPendingInvites(await repo.listPendingInvites());
  }, [repo]);
  const loadCollections = useCallback(
    async (id: string) => {
      if (repo) setCollections(await repo.listCollections(id));
    },
    [repo],
  );
  const loadEnvironments = useCallback(
    async (id: string) => {
      if (!repo) return;
      const items = await repo.listEnvironments(id);
      setEnvironments(items);
      setActiveEnvironmentId((current) => {
        if (current && items.some((item) => item.id === current)) return current;
        const userAcceptanceTesting = items.find((item) => {
          const name = item.name.trim().toLowerCase().replace(/\s+/g, " ");
          return name === "user acceptance testing" || name === "uat";
        });
        return userAcceptanceTesting?.id ?? "";
      });
    },
    [repo],
  );
  const loadCollection = useCallback(
    async (id: string) => {
      if (!repo) return;
      const [f, r] = await Promise.all([
        repo.listFolders(id),
        repo.listRequests(id),
      ]);
      setFolders(f);
      setRequests(r);
    },
    [repo],
  );
  useEffect(() => {
    setInitialLoading(true);
    Promise.all([loadWorkspaces(), loadPendingInvites()])
      .catch((e) => setError(e.message))
      .finally(() => setInitialLoading(false));
  }, [loadWorkspaces, loadPendingInvites]);
  useEffect(() => {
    if (!workspace && workspaces.length > 0) {
      chooseWorkspace(workspaces[0]).catch((e) => setError(e.message));
    }
  }, [workspaces, workspace]);
  useEffect(() => {
    const closeMenus = (except?: HTMLDetailsElement | null) => {
      document
        .querySelectorAll<HTMLDetailsElement>("details.menu[open]")
        .forEach((menu) => {
          if (menu !== except) menu.removeAttribute("open");
        });
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      closeMenus(target.closest<HTMLDetailsElement>("details.menu"));
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest(".menu-pop button")) closeMenus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const openMenu =
          document.querySelector<HTMLDetailsElement>("details.menu[open]");
        closeMenus();
        openMenu?.querySelector<HTMLElement>("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const chooseWorkspace = async (item: Workspace) => {
    setWorkspace(item);
    setCollection(null);
    setRequest(null);
    setFolderId(null);
    setActiveEnvironmentId("");
    setEnvironments([]);
    setCollectionsOpen(true);
    setExpandedCollections(new Set());
    setExpandedFolders(new Set());
    setMobilePanel("collections");
    await loadCollections(item.id);
  };
  const chooseCollection = async (item: Collection) => {
    setCollection(item);
    setRequest(null);
    setFolderId(null);
    setActiveEnvironmentId("");
    setCollectionsOpen(true);
    setExpandedCollections((current) => new Set(current).add(item.id));
    setExpandedFolders(new Set());
    setMobilePanel((current) =>
      current === "collections" ? "collections" : null,
    );
    await Promise.all([loadCollection(item.id), loadEnvironments(item.id)]);
  };
  const toggleCollection = async (item: Collection) => {
    const isOpen = expandedCollections.has(item.id);
    setExpandedCollections((current) => {
      const next = new Set(current);
      if (isOpen) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    if (!isOpen && collection?.id !== item.id) await chooseCollection(item);
  };
  const toggleFolder = (id: string) =>
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const openRequest = (item: ApiRequest) => {
    setRequest(item);
    setResponse(null);
    setError("");
    setMobilePanel(null);
  };
  const createWorkspace = async () => {
    const name = await ask({ title: "New workspace", label: "Workspace name", placeholder: "e.g. Product API", confirmLabel: "Create workspace" });
    if (!name?.trim() || !repo) return;
    setBusyLabel("Creating workspace…");
    setError("");
    try {
      const item = {
        id: newId(),
        ownerId: userId,
        ownerEmail: userEmail,
        name: name.trim(),
        createdAt: new Date().toISOString(),
      };
      await repo.createWorkspace(item);
      await loadWorkspaces();
      await chooseWorkspace(item);
      notify(`Workspace “${item.name}” created`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyLabel("");
    }
  };
  const createCollection = async () => {
    if (!workspace || !repo) return;
    const name = await ask({ title: "New collection", label: "Collection name", placeholder: "e.g. User service", confirmLabel: "Create collection" });
    if (!name?.trim()) return;
    setBusyLabel("Creating collection…");
    setError("");
    try {
      const item = {
        id: newId(),
        workspaceId: workspace.id,
        name: name.trim(),
        description: "",
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };
      await repo.createCollection(item);
      await loadCollections(workspace.id);
      await chooseCollection(item);
      notify(`Collection “${item.name}” created`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyLabel("");
    }
  };
  const createFolderAt = async (
    targetCollection: Collection,
    parentFolderId: string | null,
  ) => {
    if (!repo) return;
    const name = await ask({ title: "New folder", label: "Folder name", placeholder: "e.g. Authentication", confirmLabel: "Create folder" });
    if (!name?.trim()) return;
    setBusyLabel("Creating folder…");
    setError("");
    try {
      await repo.createFolder({
        id: newId(),
        collectionId: targetCollection.id,
        parentFolderId,
        name: name.trim(),
        description: "",
        isStarred: false,
        createdAt: new Date().toISOString(),
      });
      if (collection?.id !== targetCollection.id)
        await chooseCollection(targetCollection);
      else await loadCollection(targetCollection.id);
      if (parentFolderId)
        setExpandedFolders((current) => new Set(current).add(parentFolderId));
      notify(`Folder “${name.trim()}” created`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyLabel("");
    }
  };
  const createFolder = () => collection && createFolderAt(collection, folderId);
  const toggleFolderStar = async (item: FolderType) => {
    if (!repo) return;
    const updated = { ...item, isStarred: !item.isStarred };
    setFolders((current) =>
      current.map((folder) => (folder.id === item.id ? updated : folder)),
    );
    try {
      await repo.updateFolder(updated);
      notify(`${updated.isStarred ? "Starred" : "Unstarred"} “${item.name}”`);
    } catch (e) {
      setFolders((current) =>
        current.map((folder) => (folder.id === item.id ? item : folder)),
      );
      setError((e as Error).message);
    }
  };
  const updateEnvironmentVariable = async (key: string, value: string) => {
    if (!repo) return;
    const environment = environments.find(
      (item) => item.id === activeEnvironmentId,
    );
    if (!environment) {
      setError("Select an environment first.");
      return;
    }
    const existing = environment.variables.find((item) => item.key === key);
    const updated = {
      ...environment,
      variables: existing
        ? environment.variables.map((item) =>
            item.id === existing.id ? { ...item, value, enabled: true } : item,
          )
        : [
            ...environment.variables,
            { id: newId(), key, value, enabled: true },
          ],
    };
    try {
      await repo.updateEnvironment(updated);
      setEnvironments((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      notify(`Updated {{${key}}}`);
    } catch (cause) {
      setError((cause as Error).message);
    }
  };
  const createRequestAt = async (
    targetCollection: Collection,
    targetFolderId: string | null,
  ) => {
    if (!repo) return;
    const name = await ask({ title: "New request", label: "Request name", placeholder: "e.g. Get current user", confirmLabel: "Create request" });
    if (!name?.trim()) return;
    setBusyLabel("Creating request…");
    setError("");
    try {
      const item = emptyRequest(
        targetCollection.id,
        targetFolderId,
        name.trim(),
      );
      await repo.createRequest(item);
      if (collection?.id !== targetCollection.id)
        await chooseCollection(targetCollection);
      else setRequests(await repo.listRequests(targetCollection.id));
      if (targetFolderId)
        setExpandedFolders((current) => new Set(current).add(targetFolderId));
      setRequest(item);
      notify(`Request “${item.name}” created`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyLabel("");
    }
  };
  const createRequest = () =>
    collection && createRequestAt(collection, folderId);
  const rename = async (
    kind: "workspace" | "collection" | "folder" | "request",
    item: Workspace | Collection | FolderType | ApiRequest,
  ) => {
    if (!repo) return;
    const name = await ask({ title: `Rename ${kind}`, label: "Name", initialValue: item.name, confirmLabel: "Rename" });
    if (!name?.trim()) return;
    if (kind === "workspace") {
      await repo.updateWorkspace({ ...(item as Workspace), name });
      await loadWorkspaces();
      setWorkspace({ ...(item as Workspace), name });
    }
    if (kind === "collection") {
      await repo.updateCollection({ ...(item as Collection), name });
      await loadCollections((item as Collection).workspaceId);
      setCollection({ ...(item as Collection), name });
    }
    if (kind === "folder") {
      await repo.updateFolder({ ...(item as FolderType), name });
      await loadCollection((item as FolderType).collectionId);
    }
    if (kind === "request") {
      await repo.updateRequest({ ...(item as ApiRequest), name });
      await loadCollection((item as ApiRequest).collectionId);
      setRequest((current) =>
        current?.id === item.id ? { ...current, name } : current,
      );
    }
  };
  const remove = async (
    kind: "workspace" | "collection" | "folder" | "request",
    id: string,
  ) => {
    if (!repo) return;
    const approved = await confirmDialog({ title: `Delete ${kind}?`, message: "This action cannot be undone.", confirmLabel: `Delete ${kind}`, destructive: true });
    if (!approved) return;
    if (kind === "workspace") {
      await repo.deleteWorkspace(id);
      setWorkspace(null);
      setCollection(null);
      await loadWorkspaces();
    }
    if (kind === "collection") {
      await repo.deleteCollection(id);
      setCollection(null);
      setRequest(null);
      if (workspace) await loadCollections(workspace.id);
    }
    if (kind === "folder") {
      await repo.deleteFolder(id);
      if (folderId === id) setFolderId(null);
      if (collection) await loadCollection(collection.id);
    }
    if (kind === "request") {
      await repo.deleteRequest(id);
      if (request?.id === id) setRequest(null);
      if (collection) await loadCollection(collection.id);
    }
  };
  const duplicate = async (item: ApiRequest) => {
    if (!repo || !collection) return;
    await repo.createRequest({
      ...item,
      id: newId(),
      name: `${item.name} copy`,
      createdAt: new Date().toISOString(),
    });
    await loadCollection(collection.id);
  };
  const save = async () => {
    if (!request || !repo) return;
    setBusyLabel("Saving request…");
    setError("");
    try {
      await repo.updateRequest(request);
      setRequests((all) =>
        all.map((item) => (item.id === request.id ? request : item)),
      );
      notify("Request saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyLabel("");
    }
  };
  const send = async () => {
    if (!request?.url.trim()) {
      setError("Enter a URL before sending.");
      return;
    }
    setSending(true);
    setError("");
    setResponse(null);
    try {
      await save();
      const environment = environments.find(
        (item) => item.id === activeEnvironmentId,
      );
      const res = await fetch("/api/proxy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...request,
          environment: environment?.variables ?? [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResponse(data);
      setResponseTab("Body");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  const currentFolders = folders.filter(
    (item) => item.parentFolderId === folderId,
  );
  const currentRequests = requests.filter((item) => item.folderId === folderId);
  const folderTrail = (() => {
    const trail: FolderType[] = [];
    let id = folderId;
    while (id) {
      const item = folders.find((candidate) => candidate.id === id);
      if (!item) break;
      trail.unshift(item);
      id = item.parentFolderId;
    }
    return trail;
  })();
  const requestFolderTrail = (() => {
    const trail: FolderType[] = [];
    let id = request?.folderId ?? null;
    while (id) {
      const item = folders.find((candidate) => candidate.id === id);
      if (!item) break;
      trail.unshift(item);
      id = item.parentFolderId;
    }
    return trail;
  })();
  const exportCollection = async (copy = false) => {
    if (!collection) return;
    const json = exportPostmanCollection(collection, folders, requests);
    if (copy) {
      await navigator.clipboard.writeText(json);
      notify("Collection JSON copied");
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    a.download = `${collection.name.replace(/[^\w -]/g, "") || "collection"}.postman_collection.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const exportCollectionItem = async (target: Collection) => {
    if (!repo) return;
    const [targetFolders, targetRequests] = await Promise.all([
      repo.listFolders(target.id),
      repo.listRequests(target.id),
    ]);
    const json = exportPostmanCollection(target, targetFolders, targetRequests);
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    anchor.download = `${target.name.replace(/[^\w -]/g, "") || "collection"}.postman_collection.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    notify(`Exported “${target.name}”`);
  };
  const exportFolder = (target: FolderType) => {
    if (!collection) return;
    const folderIds = new Set<string>([target.id]);
    let changed = true;
    while (changed) {
      changed = false;
      folders.forEach((item) => {
        if (
          item.parentFolderId &&
          folderIds.has(item.parentFolderId) &&
          !folderIds.has(item.id)
        ) {
          folderIds.add(item.id);
          changed = true;
        }
      });
    }
    const nestedFolders = folders
      .filter((item) => folderIds.has(item.id) && item.id !== target.id)
      .map((item) => ({
        ...item,
        parentFolderId:
          item.parentFolderId === target.id ? null : item.parentFolderId,
      }));
    const nestedRequests = requests
      .filter((item) => item.folderId && folderIds.has(item.folderId))
      .map((item) => ({
        ...item,
        folderId: item.folderId === target.id ? null : item.folderId,
      }));
    const json = exportPostmanCollection(
      { ...collection, name: target.name },
      nestedFolders,
      nestedRequests,
    );
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    anchor.download = `${target.name.replace(/[^\w -]/g, "") || "folder"}.postman_collection.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    notify(`Exported “${target.name}”`);
  };
  const moveRequest = async (
    item: ApiRequest,
    targetFolderId: string | null,
  ) => {
    if (!repo || item.folderId === targetFolderId) return;
    setBusyLabel("Moving request…");
    setError("");
    try {
      await repo.updateRequest({ ...item, folderId: targetFolderId });
      if (collection) await loadCollection(collection.id);
      setRequest((current) =>
        current?.id === item.id
          ? { ...current, folderId: targetFolderId }
          : current,
      );
      notify(`Moved “${item.name}”`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyLabel("");
    }
  };
  const promptMoveRequest = async (item: ApiRequest) => {
    const choice = await ask({
      title: `Move “${item.name}”`,
      label: "Destination",
      confirmLabel: "Move request",
      options: [{ label: "Collection root", value: "root" }, ...folders.map((folder) => ({ label: folder.name, value: folder.id }))],
    });
    if (!choice) return;
    await moveRequest(item, choice === "root" ? null : choice);
  };
  const importFile = async (file: File) => {
    if (!workspace || !repo) return;
    setError("");
    setBusyLabel(`Reading ${file.name}…`);
    setBusyProgress(0);
    let createdCollectionId: string | null = null;
    try {
      const imported = importPostmanCollection(await file.text(), workspace.id);
      const total = 1 + imported.folders.length + imported.requests.length;
      let completed = 0;
      const advance = (label: string) => {
        completed += 1;
        setBusyLabel(label);
        setBusyProgress(Math.round((completed / total) * 100));
      };
      imported.collection.createdBy = userId;
      await repo.createCollection(imported.collection);
      createdCollectionId = imported.collection.id;
      advance(`Importing folders… ${completed}/${total}`);
      for (const folder of imported.folders) {
        await repo.createFolder(folder);
        advance(`Importing folders… ${completed}/${total}`);
      }
      for (const endpoint of imported.requests) {
        await repo.createRequest(endpoint);
        advance(`Importing endpoints… ${completed}/${total}`);
      }
      await loadCollections(workspace.id);
      await chooseCollection(imported.collection);
      notify(
        `Imported “${imported.collection.name}” with ${imported.folders.length} folder${imported.folders.length === 1 ? "" : "s"} and ${imported.requests.length} endpoint${imported.requests.length === 1 ? "" : "s"}`,
      );
    } catch (e) {
      if (createdCollectionId)
        await repo.deleteCollection(createdCollectionId).catch(() => undefined);
      setError(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusyLabel("");
      setBusyProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!configured)
    return (
      <main className="setup">
        <div className="setup-card">
          <BrandLogo />
          <p className="eyebrow">One step left</p>
          <h1>Connect RequestLab to Supabase</h1>
          <p>
            Add your project URL and publishable key to <code>.env.local</code>,
            then run the schema in <code>supabase/schema.sql</code>.
          </p>
          <pre>
            NEXT_PUBLIC_SUPABASE_URL=...{`\n`}
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
          </pre>
          <p className="muted">
            Restart the development server after saving the file.
          </p>
        </div>
      </main>
    );

  return (
    <main
      className="app-shell"
      aria-busy={initialLoading || Boolean(busyLabel)}
    >
      {(initialLoading || busyLabel) && (
        <LoadingOverlay
          label={busyLabel || "Loading your workspace…"}
          progress={busyProgress}
        />
      )}
      <header className="topbar">
        <button
          className="mobile-menu"
          aria-label="Open workspaces"
          onClick={() => setMobilePanel("workspaces")}
        >
          <MenuIcon size={21} />
        </button>
        <div className="brand">
          <BrandLogo />
        </div>
        <div className="workbench-context" aria-label="Current location">
          <span className="workbench-product">API Workbench</span>
          {workspace && (
            <>
              <ChevronRight size={13} />
              <strong>{workspace.name}</strong>
            </>
          )}
          {collection && (
            <>
              <ChevronRight size={13} />
              <span>{collection.name}</span>
            </>
          )}
        </div>
        <div className="top-actions">
          {workspace && collection && (
            <div className="environment-picker">
              <select
                aria-label="Active environment"
                value={activeEnvironmentId}
                onChange={(e) => setActiveEnvironmentId(e.target.value)}
              >
                <option value="">No environment</option>
                {environments.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                aria-label="Manage environments"
                title="Manage environments"
                onClick={() => setEnvironmentsOpen(true)}
              >
                <Settings2 size={16} />
              </button>
            </div>
          )}
          <ThemeToggle />
          <Link className="top-link" href="/settings" title="Account settings">
            <Settings2 size={16} /><span>Settings</span>
          </Link>
          {isAdmin && <Link className="top-link admin" href="/admin" title="Admin portal"><UserCog size={16}/><span>Admin</span></Link>}
          <span className="user-chip">
            <UserRound size={15} />
            <span>{userEmail}</span>
          </span>
          <span className="sync-label">
            <span className="sync-dot" /> Synced
          </span>
          <button
            className="logout"
            onClick={async () => {
              await createClient().auth.signOut();
              window.location.assign("/");
            }}
          >
            <LogOut size={16} />
            <span>Log out</span>
          </button>
        </div>
      </header>
      {repo && (
        <PendingInvites
          repo={repo}
          invites={pendingInvites}
          onChanged={async () => {
            await Promise.all([loadPendingInvites(), loadWorkspaces()]);
          }}
        />
      )}
      {error && (
        <div className="global-error" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <div
        className="workspace-grid"
        style={
          {
            "--collections-width": `${collectionsWidth}px`,
          } as React.CSSProperties
        }
      >
        {mobilePanel && (
          <button
            className="mobile-scrim"
            aria-label="Close navigation"
            onClick={() => setMobilePanel(null)}
          />
        )}
        <aside
          className={`rail ${mobilePanel === "workspaces" ? "mobile-open" : ""}`}
        >
          <div className="panel-heading tree-heading">
            <button
              className="tree-section-toggle"
              aria-expanded={workspacesOpen}
              onClick={() => setWorkspacesOpen(!workspacesOpen)}
            >
              {workspacesOpen ? (
                <ChevronDown size={15} />
              ) : (
                <ChevronRight size={15} />
              )}
              <span>Workspaces</span>
            </button>
            <span>
              <button
                className="icon-button"
                aria-label="New workspace"
                onClick={createWorkspace}
              >
                <Plus size={17} />
              </button>
              <button
                className="drawer-close"
                aria-label="Close workspaces"
                onClick={() => setMobilePanel(null)}
              >
                <X size={18} />
              </button>
            </span>
          </div>
          {workspacesOpen &&
            (workspaces.length === 0 ? (
              <Empty
                compact
                icon={<Box />}
                title="No workspaces yet"
                text="Create your first workspace to begin."
                action={
                  <button className="primary" onClick={createWorkspace}>
                    <Plus size={15} /> Create workspace
                  </button>
                }
              />
            ) : (
              <div className="nav-list tree-list">
                {workspaces.map((item) => (
                  <div
                    className={`nav-item ${workspace?.id === item.id ? "active" : ""}`}
                    key={item.id}
                  >
                    <button
                      className="nav-main"
                      title={item.ownerEmail ? `Workspace owner: ${item.ownerEmail}` : "Workspace owner unavailable"}
                      aria-label={`${item.name}${item.ownerEmail ? `, owned by ${item.ownerEmail}` : ""}`}
                      onClick={() => chooseWorkspace(item)}
                    >
                      <Box size={16} />
                      <span>{item.name}</span>
                    </button>
                    {item.ownerId === userId && (
                      <details className="menu">
                        <summary aria-label="Workspace actions">
                          <MoreHorizontal size={16} />
                        </summary>
                        <div className="menu-pop">
                          <button onClick={() => rename("workspace", item)}>
                            Rename
                          </button>
                          <button
                            className="danger"
                            onClick={() => remove("workspace", item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            ))}
        </aside>
        <aside
          className={`sidebar tree-sidebar ${mobilePanel === "collections" ? "mobile-open" : ""}`}
        >
          <div className="panel-heading">
            <span className="workspace-title">
              {workspace?.name || "Collections"}
            </span>
            <span>
              {workspace && (
                <button
                  className="icon-button"
                  aria-label="Manage workspace people"
                  title="Manage people"
                  onClick={() => setPeopleOpen(true)}
                >
                  <Users size={17} />
                </button>
              )}
              {workspace && (
                <button
                  className="icon-button"
                  aria-label="New collection"
                  title="New collection"
                  onClick={createCollection}
                >
                  <Plus size={17} />
                </button>
              )}
              <button
                className="drawer-close"
                aria-label="Close collections"
                onClick={() => setMobilePanel(null)}
              >
                <X size={18} />
              </button>
            </span>
          </div>
          {!workspace ? (
            <Empty
              icon={<Box />}
              title="Choose a workspace"
              text="Your collections will appear here."
            />
          ) : collections.length === 0 ? (
            <Empty
              icon={<Folder />}
              title="No collections yet"
              text="Create a collection to organize endpoints and forms."
              action={
                <>
                  <button className="primary" onClick={createCollection}>
                    <Plus size={15} /> Create collection
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setPeopleOpen(true)}
                  >
                    <Users size={15} /> Invite people
                  </button>
                </>
              }
            />
          ) : (
            <div className="collection-tree">
              <button
                className="tree-section-toggle tree-root"
                aria-expanded={collectionsOpen}
                onClick={() => setCollectionsOpen(!collectionsOpen)}
              >
                {collectionsOpen ? (
                  <ChevronDown size={15} />
                ) : (
                  <ChevronRight size={15} />
                )}
                <span>Collections</span>
              </button>
              {collectionsOpen &&
                collections.map((item) => (
                  <CollectionTreeNode
                    key={item.id}
                    item={item}
                    canDelete={isAdmin || workspace?.ownerId === userId || item.createdBy === userId}
                    onEditDocumentation={setDocumentationTarget}
                    activeCollection={collection}
                    expanded={expandedCollections.has(item.id)}
                    folders={collection?.id === item.id ? folders : []}
                    requests={collection?.id === item.id ? requests : []}
                    expandedFolders={expandedFolders}
                    activeRequest={request}
                    onChooseCollection={chooseCollection}
                    onToggleCollection={toggleCollection}
                    onToggleFolder={toggleFolder}
                    onChooseFolder={setFolderId}
                    onOpenRequest={openRequest}
                    onRename={rename}
                    onRemove={remove}
                    onDuplicate={duplicate}
                    onAddFolder={createFolderAt}
                    onAddRequest={createRequestAt}
                    onExportCollection={exportCollectionItem}
                    onExportFolder={exportFolder}
                    onToggleFolderStar={toggleFolderStar}
                    onMoveRequest={moveRequest}
                    onPromptMoveRequest={promptMoveRequest}
                  />
                ))}
            </div>
          )}{" "}
          {workspace && (
            <div className="sidebar-footer">
              {collection && (
                <div className="tree-create-actions">
                  <button className="secondary" onClick={createFolder}>
                    <FolderOpen size={15} /> Folder
                  </button>
                  <button className="primary" onClick={createRequest}>
                    <Plus size={15} /> Request
                  </button>
                </div>
              )}
              <button
                className="text-button"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={15} /> Import Postman JSON
              </button>
              <input
                ref={fileRef}
                hidden
                type="file"
                accept="application/json,.json"
                onChange={(e) =>
                  e.target.files?.[0] && importFile(e.target.files[0])
                }
              />
            </div>
          )}
          <div
            className="collections-resizer"
            role="separator"
            aria-label="Resize collections panel"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={resizeCollections}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft")
                setCollectionsWidth((width) => Math.max(230, width - 20));
              if (event.key === "ArrowRight")
                setCollectionsWidth((width) => Math.min(620, width + 20));
            }}
          />
        </aside>
        <section
          className={`content resource-pane ${resourcePaneOpen ? "" : "collapsed"}`}
          aria-label="Collection contents"
        >
          <div className="content-bar">
            {resourcePaneOpen && (
              <>
                <div className="breadcrumbs">
                  <button onClick={() => setFolderId(null)}>
                    {collection?.name || "Collection"}
                  </button>
                  {folderTrail.map((item) => (
                    <span key={item.id}>
                      <ChevronRight size={14} />
                      <button onClick={() => setFolderId(item.id)}>
                        {item.name}
                      </button>
                    </span>
                  ))}
                </div>
                {collection && (
                  <div className="toolbar">
                    <button
                      className="secondary"
                      onClick={() => exportCollection(true)}
                    >
                      <Clipboard size={15} /> Copy JSON
                    </button>
                    <button
                      className="secondary"
                      onClick={() => exportCollection()}
                    >
                      <Download size={15} /> Export
                    </button>
                    <button className="secondary" onClick={createFolder}>
                      <FolderOpen size={15} /> Folder
                    </button>
                    <button className="primary" onClick={createRequest}>
                      <Plus size={15} /> Request
                    </button>
                  </div>
                )}
              </>
            )}
            <button
              className="icon-button pane-visibility-toggle"
              aria-label={
                resourcePaneOpen
                  ? "Hide collection pane"
                  : "Show collection pane"
              }
              title={
                resourcePaneOpen
                  ? "Hide collection pane"
                  : "Show collection pane"
              }
              aria-expanded={resourcePaneOpen}
              onClick={() => setResourcePaneOpen(!resourcePaneOpen)}
            >
              {resourcePaneOpen ? (
                <PanelLeftClose size={18} />
              ) : (
                <PanelLeftOpen size={18} />
              )}
            </button>
          </div>
          {resourcePaneOpen &&
            (!collection ? (
              <Empty
                icon={<Folder />}
                title="Select a collection"
                text="Choose or create a collection to organize API requests."
              />
            ) : (
              <div className="resource-list">
                {currentFolders.map((item) => (
                  <Resource
                    key={item.id}
                    icon={<FolderOpen size={18} />}
                    title={item.name}
                    onOpen={() => setFolderId(item.id)}
                    actions={
                      <>
                        <button onClick={() => rename("folder", item)}>
                          Rename
                        </button>
                        <button
                          className="danger"
                          onClick={() => remove("folder", item.id)}
                        >
                          Delete
                        </button>
                      </>
                    }
                  />
                ))}
                {currentRequests.map((item) => (
                  <Resource
                    key={item.id}
                    icon={
                      <span className={`method ${item.method.toLowerCase()}`}>
                        {item.method}
                      </span>
                    }
                    title={item.name}
                    subtitle={item.url}
                    active={request?.id === item.id}
                    onOpen={() => openRequest(item)}
                    actions={
                      <>
                        <button onClick={() => setDocumentationTarget(item)}>Documentation</button>
                        <button onClick={() => rename("request", item)}>
                          Rename
                        </button>
                        <button onClick={() => duplicate(item)}>
                          <Copy size={14} /> Duplicate
                        </button>
                        <button
                          className="danger"
                          onClick={() => remove("request", item.id)}
                        >
                          Delete
                        </button>
                      </>
                    }
                  />
                ))}
                {!currentFolders.length && !currentRequests.length && (
                  <Empty
                    icon={<FileJson />}
                    title="Nothing here yet"
                    text="Add a request or folder to this collection."
                  />
                )}
              </div>
            ))}
        </section>
        <section className={`editor ${request ? "open" : ""}`}>
          {request ? (
            <>
              <div className="editor-head">
                <div className="request-heading">
                  <div className="request-breadcrumbs" aria-label="Request location">
                    <span>{collection?.name || "Collection"}</span>
                    {requestFolderTrail.map((item) => (
                      <span key={item.id}>
                        <ChevronRight size={12} /> {item.name}
                      </span>
                    ))}
                  </div>
                  <input
                    className="request-name"
                    aria-label="Request name"
                    value={request.name}
                    onChange={(e) =>
                      setRequest({ ...request, name: e.target.value })
                    }
                  />
                </div>
                <div className="editor-actions">
                  <button
                    className="secondary"
                    onClick={() => setCurlOpen(true)}
                  >
                    <FileJson size={15} /> Show cURL
                  </button>
                  <button className="secondary" onClick={save}>
                    <Save size={15} /> Save
                  </button>
                </div>
              </div>
              <div className="url-row">
                <select
                  aria-label="HTTP method"
                  value={request.method}
                  onChange={(e) =>
                    setRequest({
                      ...request,
                      method: e.target.value as HttpMethod,
                    })
                  }
                >
                  {methods.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <input
                  aria-label="Request URL"
                  placeholder="https://api.example.com/users"
                  value={request.url}
                  onChange={(e) =>
                    setRequest({ ...request, url: e.target.value })
                  }
                  onKeyDown={(e) => e.key === "Enter" && send()}
                />
                <button className="send" disabled={sending} onClick={send}>
                  <Send size={16} />
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
              <EnvironmentVariableHints
                names={requestVariableNames(request)}
                environment={environments.find(
                  (item) => item.id === activeEnvironmentId,
                )}
                onSave={updateEnvironmentVariable}
                onManage={() => setEnvironmentsOpen(true)}
              />
              <Tabs
                labels={["Docs", "Params", "Headers", "Body", "Auth"]}
                value={requestTab}
                onChange={(v) => setRequestTab(v as typeof requestTab)}
              />
              <div className="editor-body">
                {requestTab === "Docs" && (
                  <div className="endpoint-docs-panel">
                    <div className="endpoint-docs-toolbar"><div><span className="eyebrow">Endpoint documentation</span><h3>How does this endpoint work?</h3></div><button className="primary" onClick={() => void save()}>Save documentation</button></div>
                    <RichDocumentationEditor key={request.id} value={request.documentation || ""} onChange={(documentation) => setRequest({ ...request, documentation })} />
                    <p className="muted">Use headings, bullets, code blocks, example URLs, and expected responses. Documentation is saved with this request.</p>
                  </div>
                )}
                {requestTab === "Params" && (
                  <KeyValueEditor
                    value={request.params}
                    onChange={(params) => setRequest({ ...request, params })}
                    keyLabel="Parameter"
                  />
                )}
                {requestTab === "Headers" && (
                  <KeyValueEditor
                    value={request.headers}
                    onChange={(headers) => setRequest({ ...request, headers })}
                    keyLabel="Header"
                  />
                )}
                {requestTab === "Body" && (
                  <BodyEditor request={request} setRequest={setRequest} />
                )}
                {requestTab === "Auth" && (
                  <AuthEditor request={request} setRequest={setRequest} />
                )}
              </div>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              {response && (
                <div className="response" style={{ height: responseHeight }}>
                  <div
                    className="response-resizer"
                    role="separator"
                    aria-label="Resize response panel"
                    aria-orientation="horizontal"
                    aria-valuemin={180}
                    aria-valuemax={900}
                    aria-valuenow={responseHeight}
                    tabIndex={0}
                    onPointerDown={resizeResponse}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp")
                        setResponseHeight((height) =>
                          Math.min(900, height + 20),
                        );
                      if (event.key === "ArrowDown")
                        setResponseHeight((height) =>
                          Math.max(180, height - 20),
                        );
                    }}
                  />
                  <div className="response-meta">
                    <span className="response-title">Response</span>
                    <strong
                      className={
                        response.status < 400 ? "success-text" : "danger-text"
                      }
                    >
                      {response.status} {response.statusText}
                    </strong>
                    <span>{response.durationMs} ms</span>
                    <span>{bytes(response.sizeBytes)}</span>
                    <button
                      className="secondary response-copy"
                      aria-label="Copy response body"
                      title="Copy response body"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(response.body);
                          notify("Response body copied");
                        } catch {
                          setError(
                            "Could not copy the response body. Check browser clipboard permission.",
                          );
                        }
                      }}
                    >
                      <Copy size={14} /> <span>Copy response</span>
                    </button>
                  </div>
                  <Tabs
                    labels={["Body", "Headers"]}
                    value={responseTab}
                    onChange={(v) => setResponseTab(v as typeof responseTab)}
                  />
                  <div className="response-content">
                    {responseTab === "Body" ? (
                      <pre className="json-viewer">
                        <code>
                          {(jsonTokens(response.body) ??
                            pretty(response.body)) ||
                            "(empty body)"}
                        </code>
                      </pre>
                    ) : (
                      response.headers.map((h, i) => (
                        <div className="header-line" key={`${h.key}-${i}`}>
                          <strong>{h.key}</strong>
                          <span>{h.value}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <Empty
              icon={<Settings2 />}
              title="Open a request"
              text="Select a request to edit and send it."
            />
          )}
        </section>
      </div>
      <nav className="mobile-bottom" aria-label="Workspace navigation">
        <button onClick={() => setMobilePanel("workspaces")}>
          <Box size={19} />
          <span>Workspaces</span>
        </button>
        <button
          onClick={() => setMobilePanel("collections")}
          disabled={!workspace}
        >
          <Library size={19} />
          <span>Collections</span>
        </button>
        <button
          className="mobile-add"
          onClick={createRequest}
          disabled={!collection}
        >
          <Plus size={22} />
          <span>Request</span>
        </button>
      </nav>
      {peopleOpen && workspace && repo && (
        <WorkspacePeople
          repo={repo}
          workspace={workspace}
          isOwner={workspace.ownerId === userId}
          onClose={() => setPeopleOpen(false)}
        />
      )}{" "}
      {environmentsOpen && workspace && collection && repo && (
        <EnvironmentManager
          repo={repo}
          workspace={workspace}
          collection={collection}
          environments={environments}
          activeId={activeEnvironmentId}
          onActiveChange={setActiveEnvironmentId}
          onChanged={() => loadEnvironments(collection.id)}
          onClose={() => setEnvironmentsOpen(false)}
        />
      )}{" "}
      {curlOpen && request && (
        <CurlPanel
          value={createCurl(
            request,
            environments.find((item) => item.id === activeEnvironmentId)
              ?.variables,
          )}
          onClose={() => setCurlOpen(false)}
          onCopied={() => notify("cURL copied")}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {dialog}
      {documentationTarget && <DocumentationEditor target={documentationTarget} onClose={() => setDocumentationTarget(null)} onSave={async (content) => {
        if (!repo) return;
        if ("method" in documentationTarget) {
          const updated = { ...documentationTarget, documentation: content };
          await repo.updateRequest(updated);
          setRequests((items) => items.map((item) => item.id === updated.id ? updated : item));
          if (request?.id === updated.id) setRequest(updated);
        } else if ("workspaceId" in documentationTarget) {
          const updated = { ...documentationTarget, description: content };
          await repo.updateCollection(updated);
          setCollections((items) => items.map((item) => item.id === updated.id ? updated : item));
          if (collection?.id === updated.id) setCollection(updated);
        } else {
          const updated = { ...documentationTarget, description: content };
          await repo.updateFolder(updated);
          setFolders((items) => items.map((item) => item.id === updated.id ? updated : item));
        }
        setDocumentationTarget(null);
      }} />}
    </main>
  );
}

function EnvironmentVariableHints({
  names,
  environment,
  onSave,
  onManage,
}: {
  names: string[];
  environment?: Environment;
  onSave: (key: string, value: string) => Promise<void>;
  onManage: () => void;
}) {
  if (!names.length) return null;
  return (
    <div className="variable-hints" aria-label="Variables used in request">
      <span>Variables in request</span>
      {names.map((name) => (
        <VariableHint
          key={name}
          name={name}
          value={
            environment?.variables.find(
              (item) => item.enabled && item.key === name,
            )?.value ?? ""
          }
          configured={Boolean(
            environment?.variables.some(
              (item) => item.enabled && item.key === name,
            ),
          )}
          onSave={onSave}
          onManage={onManage}
        />
      ))}
    </div>
  );
}

function VariableHint({
  name,
  value,
  configured,
  onSave,
  onManage,
}: {
  name: string;
  value: string;
  configured: boolean;
  onSave: (key: string, value: string) => Promise<void>;
  onManage: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className={`variable-hint ${configured ? "" : "missing"}`}>
      <button className="variable-chip" aria-haspopup="dialog">
        {`{{${name}}}`}
      </button>
      <div
        className="variable-popover"
        role="dialog"
        aria-label={`Edit ${name}`}
      >
        <strong>{name}</strong>
        <small>
          {configured ? "Active environment value" : "Not configured"}
        </small>
        {configured ? (
          <>
            <input
              aria-label={`${name} value`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSave(name, draft);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Save size={14} />
              )}
              Save
            </button>
          </>
        ) : (
          <button className="secondary" onClick={onManage}>
            <Settings2 size={14} /> Manage environments
          </button>
        )}
      </div>
    </div>
  );
}

function CurlPanel({
  value,
  onClose,
  onCopied,
}: {
  value: string;
  onClose: () => void;
  onCopied: () => void;
}) {
  return (
    <aside
      className="curl-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="curl-title"
    >
      <header>
        <div>
          <span className="eyebrow">Code snippet</span>
          <h2 id="curl-title">cURL</h2>
        </div>
        <div>
          <button
            className="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(value);
              onCopied();
            }}
          >
            <Copy size={15} /> Copy
          </button>
          <button
            className="icon-button"
            aria-label="Close cURL panel"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </header>
      <pre>
        <code>{value}</code>
      </pre>
    </aside>
  );
}

function EnvironmentManager({
  repo,
  workspace,
  collection,
  environments,
  activeId,
  onActiveChange,
  onChanged,
  onClose,
}: {
  repo: Repository;
  workspace: Workspace;
  collection: Collection;
  environments: Environment[];
  activeId: string;
  onActiveChange: (id: string) => void;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const { ask, confirm: confirmDialog, dialog } = useAppDialog();
  const [selectedId, setSelectedId] = useState(
    activeId || environments[0]?.id || "",
  );
  const [draft, setDraft] = useState<Environment | null>(
    () =>
      environments.find(
        (item) => item.id === (activeId || environments[0]?.id),
      ) ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const select = (id: string) => {
    setSelectedId(id);
    setDraft(environments.find((item) => item.id === id) ?? null);
  };
  const create = async () => {
    const name = await ask({ title: "New environment", label: "Environment name", placeholder: "e.g. User Acceptance Testing", confirmLabel: "Create environment" });
    if (!name?.trim()) return;
    const item: Environment = {
      id: newId(),
      workspaceId: workspace.id,
      collectionId: collection.id,
      name: name.trim(),
      variables: [{ id: newId(), key: "", value: "", enabled: true }],
      createdAt: new Date().toISOString(),
    };
    setBusy(true);
    try {
      await repo.createEnvironment(item);
      await onChanged();
      setSelectedId(item.id);
      setDraft(item);
      onActiveChange(item.id);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const saveEnvironment = async () => {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await repo.updateEnvironment(draft);
      await onChanged();
      onActiveChange(draft.id);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const removeEnvironment = async () => {
    if (!draft) return;
    const approved = await confirmDialog({ title: `Delete “${draft.name}”?`, message: "Requests using this environment will keep their unresolved variable names.", confirmLabel: "Delete environment", destructive: true });
    if (!approved) return;
    setBusy(true);
    try {
      await repo.deleteEnvironment(draft.id);
      if (activeId === draft.id) onActiveChange("");
      setDraft(null);
      setSelectedId("");
      await onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-scrim" role="presentation">
      <section
        className="environment-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="environment-title"
      >
        <header>
          <div>
            <span className="eyebrow">Collection variables</span>
            <h2 id="environment-title">Environments</h2>
            <small>{collection.name}</small>
          </div>
          <button
            className="icon-button"
            aria-label="Close environments"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <div className="environment-layout">
          <aside>
            <button
              className="primary new-environment"
              disabled={busy}
              onClick={create}
            >
              <Plus size={15} /> New environment
            </button>
            {environments.map((item) => (
              <button
                className={selectedId === item.id ? "active" : ""}
                onClick={() => select(item.id)}
                key={item.id}
              >
                {item.name}
              </button>
            ))}
          </aside>
          <div className="environment-editor">
            {draft ? (
              <>
                <label className="field">
                  <span>Environment name</span>
                  <input
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </label>
                <p className="environment-help">
                  Scoped to <strong>{collection.name}</strong>. Use variables in
                  requests as <code>{"{{base_url}}"}</code>. Enabled values are
                  resolved only when sending.
                </p>
                <KeyValueEditor
                  value={draft.variables}
                  onChange={(variables) => setDraft({ ...draft, variables })}
                  keyLabel="Variable"
                />
                <div className="environment-actions">
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={removeEnvironment}
                  >
                    Delete
                  </button>
                  <button
                    className="primary"
                    disabled={busy || !draft.name.trim()}
                    onClick={saveEnvironment}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Save size={15} />
                    )}{" "}
                    Save environment
                  </button>
                </div>
              </>
            ) : (
              <Empty
                compact
                icon={<Settings2 />}
                title="No environment selected"
                text="Create an environment for development, staging, or production values."
              />
            )}
            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
          </div>
        </div>
      </section>{dialog}
    </div>
  );
}

type RenameFn = (
  kind: "workspace" | "collection" | "folder" | "request",
  item: Workspace | Collection | FolderType | ApiRequest,
) => Promise<void>;
type RemoveFn = (
  kind: "workspace" | "collection" | "folder" | "request",
  id: string,
) => Promise<void>;

function CollectionTreeNode({
  item,
  canDelete,
  onEditDocumentation,
  activeCollection,
  expanded,
  folders,
  requests,
  expandedFolders,
  activeRequest,
  onChooseCollection,
  onToggleCollection,
  onToggleFolder,
  onChooseFolder,
  onOpenRequest,
  onRename,
  onRemove,
  onDuplicate,
  onAddFolder,
  onAddRequest,
  onExportCollection,
  onExportFolder,
  onToggleFolderStar,
  onMoveRequest,
  onPromptMoveRequest,
}: {
  item: Collection;
  canDelete: boolean;
  onEditDocumentation: (target: Collection | FolderType) => void;
  activeCollection: Collection | null;
  expanded: boolean;
  folders: FolderType[];
  requests: ApiRequest[];
  expandedFolders: Set<string>;
  activeRequest: ApiRequest | null;
  onChooseCollection: (item: Collection) => Promise<void>;
  onToggleCollection: (item: Collection) => Promise<void>;
  onToggleFolder: (id: string) => void;
  onChooseFolder: (id: string | null) => void;
  onOpenRequest: (item: ApiRequest) => void;
  onRename: RenameFn;
  onRemove: RemoveFn;
  onDuplicate: (item: ApiRequest) => Promise<void>;
  onAddFolder: (
    collection: Collection,
    parentId: string | null,
  ) => Promise<void>;
  onAddRequest: (
    collection: Collection,
    folderId: string | null,
  ) => Promise<void>;
  onExportCollection: (collection: Collection) => Promise<void>;
  onExportFolder: (folder: FolderType) => void;
  onToggleFolderStar: (folder: FolderType) => Promise<void>;
  onMoveRequest: (item: ApiRequest, folderId: string | null) => Promise<void>;
  onPromptMoveRequest: (item: ApiRequest) => Promise<void>;
}) {
  return (
    <div className="tree-group">
      <div
        className={`tree-row collection-row ${activeCollection?.id === item.id ? "active" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const endpoint = requests.find(
            (request) =>
              request.id ===
              event.dataTransfer.getData("text/requestlab-request"),
          );
          if (endpoint) onMoveRequest(endpoint, null);
        }}
      >
        <button
          className="tree-disclosure"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${item.name}`}
          aria-expanded={expanded}
          onClick={() => onToggleCollection(item)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button className="tree-label" onClick={() => onChooseCollection(item)}>
          <Folder size={15} />
          <span>{item.name}</span>
        </button>
        <TreeMenu label={`${item.name} actions`}>
          <button onClick={() => onAddRequest(item, null)}>Add request</button>
          <button onClick={() => onAddFolder(item, null)}>Add folder</button>
          <button onClick={() => onEditDocumentation(item)}>Documentation</button>
          <button onClick={() => onExportCollection(item)}>
            Export collection
          </button>
          <button onClick={() => onRename("collection", item)}>Rename</button>
          {canDelete && <button
            className="danger"
            onClick={() => onRemove("collection", item.id)}
          >
            Delete
          </button>}
        </TreeMenu>
      </div>
      {expanded && activeCollection?.id === item.id && (
        <div className="tree-children" role="group">
          {folders
            .filter((folder) => folder.parentFolderId === null)
            .sort(starredFirst)
            .map((folder) => (
              <FolderTreeNode
                key={folder.id}
                folder={folder}
                depth={1}
                folders={folders}
                requests={requests}
                expandedFolders={expandedFolders}
                activeRequest={activeRequest}
                onToggleFolder={onToggleFolder}
                onChooseFolder={onChooseFolder}
                onOpenRequest={onOpenRequest}
                onRename={onRename}
                onRemove={onRemove}
                onDuplicate={onDuplicate}
                collection={item}
                onAddFolder={onAddFolder}
                onAddRequest={onAddRequest}
                onExportFolder={onExportFolder}
                onToggleFolderStar={onToggleFolderStar}
                onMoveRequest={onMoveRequest}
                onEditDocumentation={onEditDocumentation}
                onPromptMoveRequest={onPromptMoveRequest}
              />
            ))}
          {requests
            .filter((endpoint) => endpoint.folderId === null)
            .map((endpoint) => (
              <RequestTreeRow
                key={endpoint.id}
                endpoint={endpoint}
                depth={1}
                active={activeRequest?.id === endpoint.id}
                onOpen={onOpenRequest}
                onRename={onRename}
                onRemove={onRemove}
                onDuplicate={onDuplicate}
                onMoveRequest={onPromptMoveRequest}
              />
            ))}
          {folders.length === 0 && requests.length === 0 && (
            <div className="tree-empty">No requests yet</div>
          )}
        </div>
      )}
    </div>
  );
}

function FolderTreeNode({
  collection,
  folder,
  depth,
  folders,
  requests,
  expandedFolders,
  activeRequest,
  onToggleFolder,
  onChooseFolder,
  onOpenRequest,
  onRename,
  onRemove,
  onDuplicate,
  onAddFolder,
  onAddRequest,
  onExportFolder,
  onToggleFolderStar,
  onMoveRequest,
  onPromptMoveRequest,
  onEditDocumentation,
}: {
  collection: Collection;
  folder: FolderType;
  depth: number;
  folders: FolderType[];
  requests: ApiRequest[];
  expandedFolders: Set<string>;
  activeRequest: ApiRequest | null;
  onToggleFolder: (id: string) => void;
  onChooseFolder: (id: string) => void;
  onOpenRequest: (item: ApiRequest) => void;
  onRename: RenameFn;
  onRemove: RemoveFn;
  onDuplicate: (item: ApiRequest) => Promise<void>;
  onAddFolder: (
    collection: Collection,
    parentId: string | null,
  ) => Promise<void>;
  onAddRequest: (
    collection: Collection,
    folderId: string | null,
  ) => Promise<void>;
  onExportFolder: (folder: FolderType) => void;
  onToggleFolderStar: (folder: FolderType) => Promise<void>;
  onMoveRequest: (item: ApiRequest, folderId: string | null) => Promise<void>;
  onPromptMoveRequest: (item: ApiRequest) => Promise<void>;
  onEditDocumentation: (target: Collection | FolderType) => void;
}) {
  const expanded = expandedFolders.has(folder.id);
  const children = folders
    .filter((item) => item.parentFolderId === folder.id)
    .sort(starredFirst);
  const endpoints = requests.filter((item) => item.folderId === folder.id);
  return (
    <div className="tree-group">
      <div
        className="tree-row"
        style={{ "--tree-depth": depth } as React.CSSProperties}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const endpoint = requests.find(
            (request) =>
              request.id ===
              event.dataTransfer.getData("text/requestlab-request"),
          );
          if (endpoint) onMoveRequest(endpoint, folder.id);
        }}
      >
        <button
          className="tree-disclosure"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${folder.name}`}
          aria-expanded={expanded}
          onClick={() => onToggleFolder(folder.id)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          className="tree-label"
          onClick={() => {
            onChooseFolder(folder.id);
            onToggleFolder(folder.id);
          }}
        >
          <FolderOpen size={15} />
          <span>{folder.name}</span>
        </button>
        <button
          className={`tree-star ${folder.isStarred ? "active" : ""}`}
          aria-label={`${folder.isStarred ? "Unstar" : "Star"} ${folder.name}`}
          aria-pressed={folder.isStarred}
          title={folder.isStarred ? "Unstar folder" : "Star folder"}
          onClick={() => onToggleFolderStar(folder)}
        >
          <Star size={14} fill={folder.isStarred ? "currentColor" : "none"} />
        </button>
        <TreeMenu label={`${folder.name} actions`}>
          <button onClick={() => onAddRequest(collection, folder.id)}>
            Add request
          </button>
          <button onClick={() => onAddFolder(collection, folder.id)}>
            Add subfolder
          </button>
          <button onClick={() => onEditDocumentation(folder)}>Documentation</button>
          <button onClick={() => onExportFolder(folder)}>Export folder</button>
          <button onClick={() => onRename("folder", folder)}>Rename</button>
          <button
            className="danger"
            onClick={() => onRemove("folder", folder.id)}
          >
            Delete
          </button>
        </TreeMenu>
      </div>
      {expanded && (
        <div role="group">
          {children.map((child) => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              collection={collection}
              depth={depth + 1}
              folders={folders}
              requests={requests}
              expandedFolders={expandedFolders}
              activeRequest={activeRequest}
              onToggleFolder={onToggleFolder}
              onChooseFolder={onChooseFolder}
              onOpenRequest={onOpenRequest}
              onRename={onRename}
              onRemove={onRemove}
              onDuplicate={onDuplicate}
              onAddFolder={onAddFolder}
              onAddRequest={onAddRequest}
              onExportFolder={onExportFolder}
              onToggleFolderStar={onToggleFolderStar}
              onMoveRequest={onMoveRequest}
              onPromptMoveRequest={onPromptMoveRequest}
              onEditDocumentation={onEditDocumentation}
            />
          ))}
          {endpoints.map((endpoint) => (
            <RequestTreeRow
              key={endpoint.id}
              endpoint={endpoint}
              depth={depth + 1}
              active={activeRequest?.id === endpoint.id}
              onOpen={onOpenRequest}
              onRename={onRename}
              onRemove={onRemove}
              onDuplicate={onDuplicate}
              onMoveRequest={onPromptMoveRequest}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RichDocumentationEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { ask, dialog } = useAppDialog();
  const editorRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (editorRef.current && !initialized.current) {
      editorRef.current.innerHTML = value;
      initialized.current = true;
    }
  }, [value]);
  const command = (name: string, argument?: string) => {
    editorRef.current?.focus();
    document.execCommand(name, false, argument);
    onChange(editorRef.current?.innerHTML || "");
  };
  const link = async () => {
    const url = await ask({ title: "Add link", label: "URL", placeholder: "https://example.com", confirmLabel: "Insert link" });
    if (url) command("createLink", url);
  };
  return <div className="rich-doc-editor">
    <div className="rich-doc-toolbar" role="toolbar" aria-label="Documentation formatting">
      <select aria-label="Text style" defaultValue="p" onChange={(event) => command("formatBlock", event.target.value)}><option value="p">Normal text</option><option value="h2">Heading 1</option><option value="h3">Heading 2</option><option value="h4">Heading 3</option></select>
      <button type="button" aria-label="Bold" title="Bold" onClick={() => command("bold")}><Bold size={15}/></button><button type="button" aria-label="Italic" title="Italic" onClick={() => command("italic")}><Italic size={15}/></button><button type="button" aria-label="Underline" title="Underline" onClick={() => command("underline")}><Underline size={15}/></button><span className="rich-doc-divider" />
      <button type="button" aria-label="Bulleted list" title="Bulleted list" onClick={() => command("insertUnorderedList")}><List size={15}/></button><button type="button" aria-label="Numbered list" title="Numbered list" onClick={() => command("insertOrderedList")}><ListOrdered size={15}/></button><button type="button" aria-label="Quote" title="Quote" onClick={() => command("formatBlock", "blockquote")}><Quote size={15}/></button><button type="button" aria-label="Code block" title="Code block" onClick={() => command("formatBlock", "pre")}><Code2 size={15}/></button><button type="button" aria-label="Add link" title="Add link" onClick={() => void link()}><Link2 size={15}/></button>
    </div>
    <div ref={editorRef} className="rich-doc-content" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" data-placeholder="Describe what this endpoint does, its parameters, authentication, examples, and expected responses..." onInput={(event) => onChange(event.currentTarget.innerHTML)} />
    {dialog}</div>;
}

function DocumentationEditor({
  target,
  onClose,
  onSave,
}: {
  target: Collection | FolderType | ApiRequest;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
}) {
  const [content, setContent] = useState("method" in target ? target.documentation || "" : target.description || "");
  const [saving, setSaving] = useState(false);
  const isRequest = "method" in target;
  const isCollection = "workspaceId" in target;
  const save = async () => {
    setSaving(true);
    try { await onSave(content); } finally { setSaving(false); }
  };
  return <div className="modal-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="documentation-modal" role="dialog" aria-modal="true" aria-labelledby="documentation-title">
      <header><div><span className="eyebrow">{isRequest ? "Endpoint documentation" : isCollection ? "Collection documentation" : "Folder documentation"}</span><h2 id="documentation-title">{target.name}</h2><p>Describe how this endpoint works, required inputs, examples, and expected responses.</p></div><button className="icon-button" aria-label="Close documentation" onClick={onClose}>×</button></header>
      <div className="documentation-editor"><textarea autoFocus value={content} onChange={(event) => setContent(event.target.value)} placeholder="# Overview\nExplain what this endpoint does...\n\n## Parameters\n\n## Example response\n" /><aside><strong>Documentation tips</strong><span>Use headings, bullets, code blocks, and example URLs.</span><span>Keep instructions concise and task-focused.</span><span>Changes are saved to this {isRequest ? "endpoint" : isCollection ? "collection" : "folder"}.</span></aside></div>
      <footer><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save documentation"}</button></footer>
    </section>
  </div>;
}

function RequestTreeRow({
  endpoint,
  depth,
  active,
  onOpen,
  onRename,
  onRemove,
  onDuplicate,
  onMoveRequest,
}: {
  endpoint: ApiRequest;
  depth: number;
  active: boolean;
  onOpen: (item: ApiRequest) => void;
  onRename: RenameFn;
  onRemove: RemoveFn;
  onDuplicate: (item: ApiRequest) => Promise<void>;
  onMoveRequest: (item: ApiRequest) => Promise<void>;
}) {
  return (
    <div
      className={`tree-row request-tree-row ${active ? "active" : ""}`}
      style={{ "--tree-depth": depth } as React.CSSProperties}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/requestlab-request", endpoint.id);
      }}
    >
      <span className={`tree-method ${endpoint.method.toLowerCase()}`}>
        {endpoint.method}
      </span>
      <button
        className="tree-label request-label"
        onClick={() => onOpen(endpoint)}
        title={endpoint.url}
      >
        <span>{endpoint.name}</span>
      </button>
      <TreeMenu label={`${endpoint.name} actions`}>
        <button onClick={() => onRename("request", endpoint)}>Rename</button>
        <button onClick={() => onDuplicate(endpoint)}>Duplicate</button>
        <button onClick={() => onMoveRequest(endpoint)}>Move to…</button>
        <button
          className="danger"
          onClick={() => onRemove("request", endpoint.id)}
        >
          Delete
        </button>
      </TreeMenu>
    </div>
  );
}

function TreeMenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="menu tree-menu">
      <summary aria-label={label}>
        <MoreHorizontal size={15} />
      </summary>
      <div className="menu-pop">
        <div className="menu-pop-header">
          <span>Actions</span>
          <button
            className="menu-close"
            aria-label="Close actions menu"
            onClick={(event) =>
              event.currentTarget.closest("details")?.removeAttribute("open")
            }
          >
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </details>
  );
}

function Tabs({
  labels,
  value,
  onChange,
}: {
  labels: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {labels.map((label) => (
        <button
          role="tab"
          aria-selected={value === label}
          className={value === label ? "active" : ""}
          onClick={() => onChange(label)}
          key={label}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
  compact = false,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty ${compact ? "compact" : ""}`}>
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action && <div className="empty-actions">{action}</div>}
    </div>
  );
}
function LoadingOverlay({
  label,
  progress,
}: {
  label: string;
  progress: number | null;
}) {
  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-card">
        <LoaderCircle className="spin" size={30} />
        <strong>{label}</strong>
        {progress !== null && (
          <>
            <div
              className="progress-track"
              aria-label={`Import progress ${progress}%`}
            >
              <span style={{ transform: `scaleX(${progress / 100})` }} />
            </div>
            <small>{progress}% complete</small>
          </>
        )}
      </div>
    </div>
  );
}
function Resource({
  icon,
  title,
  subtitle,
  onOpen,
  actions,
  active,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onOpen: () => void;
  actions: React.ReactNode;
  active?: boolean;
}) {
  return (
    <div className={`resource ${active ? "active" : ""}`}>
      <button className="resource-main" onClick={onOpen}>
        {icon}
        <span>
          <strong>{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>
      </button>
      <details className="menu">
        <summary aria-label={`${title} actions`}>
          <MoreHorizontal size={17} />
        </summary>
        <div className="menu-pop">{actions}</div>
      </details>
    </div>
  );
}
function BodyEditor({
  request,
  setRequest,
}: {
  request: ApiRequest;
  setRequest: (request: ApiRequest) => void;
}) {
  const modes: BodyMode[] = ["none", "json", "raw", "form"];
  const [bodyHeight, setBodyHeight] = useState(240);
  const highlightRef = useRef<HTMLPreElement>(null);
  const resizeBody = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = event.currentTarget;
    const startY = event.clientY;
    const startHeight = bodyHeight;
    target.setPointerCapture(event.pointerId);
    const onMove = (moveEvent: PointerEvent) =>
      setBodyHeight(
        Math.min(800, Math.max(140, startHeight + moveEvent.clientY - startY)),
      );
    const onEnd = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onEnd);
      target.removeEventListener("pointercancel", onEnd);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onEnd);
    target.addEventListener("pointercancel", onEnd);
  };
  return (
    <>
      <div className="segments">
        {modes.map((mode) => (
          <button
            className={request.bodyMode === mode ? "active" : ""}
            onClick={() => setRequest({ ...request, bodyMode: mode })}
            key={mode}
          >
            {mode.toUpperCase()}
          </button>
        ))}
      </div>
      {request.bodyMode === "none" && (
        <p className="muted">This request has no body.</p>
      )}
      {["json", "raw"].includes(request.bodyMode) && (
        <div className="body-code-editor" style={{ height: bodyHeight }}>
          {request.bodyMode === "json" && (
            <pre
              ref={highlightRef}
              className="body-highlight"
              aria-hidden="true"
            >
              {sourceJsonTokens(request.bodyRaw)}
              {request.bodyRaw.endsWith("\n") ? "\n" : null}
            </pre>
          )}
          <textarea
            className={
              request.bodyMode === "json"
                ? "body-input highlighted"
                : "body-input"
            }
            aria-label="Request body"
            spellCheck={false}
            placeholder={
              request.bodyMode === "json"
                ? '{\n  "key": "value"\n}'
                : "Raw request body"
            }
            value={request.bodyRaw}
            onScroll={(event) => {
              if (!highlightRef.current) return;
              highlightRef.current.scrollTop = event.currentTarget.scrollTop;
              highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }}
            onChange={(e) =>
              setRequest({ ...request, bodyRaw: e.target.value })
            }
          />
          <div
            className="body-resizer"
            role="separator"
            aria-label="Resize request body editor"
            aria-orientation="horizontal"
            aria-valuemin={140}
            aria-valuemax={800}
            aria-valuenow={bodyHeight}
            tabIndex={0}
            onPointerDown={resizeBody}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp")
                setBodyHeight((height) => Math.max(140, height - 20));
              if (event.key === "ArrowDown")
                setBodyHeight((height) => Math.min(800, height + 20));
            }}
          />
        </div>
      )}
      {request.bodyMode === "form" && (
        <KeyValueEditor
          value={request.bodyForm}
          onChange={(bodyForm) => setRequest({ ...request, bodyForm })}
          keyLabel="Field"
        />
      )}
    </>
  );
}
function AuthEditor({
  request,
  setRequest,
}: {
  request: ApiRequest;
  setRequest: (request: ApiRequest) => void;
}) {
  return (
    <>
      <div className="segments">
        {(["none", "bearer", "basic"] as const).map((type) => (
          <button
            className={request.auth.type === type ? "active" : ""}
            onClick={() =>
              setRequest({ ...request, auth: { ...request.auth, type } })
            }
            key={type}
          >
            {type.toUpperCase()}
          </button>
        ))}
      </div>
      {request.auth.type === "none" && (
        <p className="muted">No authorization will be added.</p>
      )}
      {request.auth.type === "bearer" && (
        <label className="field">
          <span>Bearer token</span>
          <input
            type="password"
            value={request.auth.bearerToken ?? ""}
            onChange={(e) =>
              setRequest({
                ...request,
                auth: { ...request.auth, bearerToken: e.target.value },
              })
            }
          />
        </label>
      )}
      {request.auth.type === "basic" && (
        <div className="field-grid">
          <label className="field">
            <span>Username</span>
            <input
              autoComplete="username"
              value={request.auth.basicUsername ?? ""}
              onChange={(e) =>
                setRequest({
                  ...request,
                  auth: { ...request.auth, basicUsername: e.target.value },
                })
              }
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={request.auth.basicPassword ?? ""}
              onChange={(e) =>
                setRequest({
                  ...request,
                  auth: { ...request.auth, basicPassword: e.target.value },
                })
              }
            />
          </label>
        </div>
      )}
    </>
  );
}
