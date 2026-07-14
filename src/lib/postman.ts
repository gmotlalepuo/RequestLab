import { newId } from "./id";
import {
  ApiRequest,
  Collection,
  Folder,
  HttpMethod,
  KeyValue,
  RequestAuth,
} from "../types";

const SCHEMA_V21 =
  "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

type PostmanKeyValue = {
  key?: string;
  value?: string;
  disabled?: boolean;
};

type PostmanUrl =
  | string
  | {
      raw?: string;
      protocol?: string;
      host?: string | string[];
      path?: string | string[];
      query?: PostmanKeyValue[];
    };

type PostmanAuth = {
  type?: string;
  bearer?: { key: string; value: string }[];
  basic?: { key: string; value: string }[];
};

type PostmanRequest = {
  method?: string;
  header?: PostmanKeyValue[];
  url?: PostmanUrl;
  auth?: PostmanAuth;
  body?: {
    mode?: string;
    raw?: string;
    urlencoded?: PostmanKeyValue[];
    formdata?: PostmanKeyValue[];
    options?: { raw?: { language?: string } };
  };
};

type PostmanItem = {
  name?: string;
  item?: PostmanItem[];
  request?: PostmanRequest | string;
};

export type PostmanCollectionFile = {
  info?: { name?: string; description?: unknown; schema?: string };
  item?: PostmanItem[];
  auth?: PostmanAuth;
};

export type ImportedCollection = {
  collection: Collection;
  folders: Folder[];
  requests: ApiRequest[];
};

const VALID_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

const toKeyValues = (items?: PostmanKeyValue[]): KeyValue[] =>
  (items ?? []).map((item) => ({
    id: newId(),
    key: item.key ?? "",
    value: item.value ?? "",
    enabled: item.disabled !== true,
  }));

const parseAuth = (auth?: PostmanAuth): RequestAuth => {
  if (!auth || !auth.type || auth.type === "noauth") {
    return { type: "none" };
  }
  if (auth.type === "bearer") {
    const token = auth.bearer?.find((entry) => entry.key === "token")?.value;
    return { type: "bearer", bearerToken: token ?? "" };
  }
  if (auth.type === "basic") {
    const username = auth.basic?.find(
      (entry) => entry.key === "username",
    )?.value;
    const password = auth.basic?.find(
      (entry) => entry.key === "password",
    )?.value;
    return {
      type: "basic",
      basicUsername: username ?? "",
      basicPassword: password ?? "",
    };
  }
  return { type: "none" };
};

const parseUrl = (url?: PostmanUrl): { raw: string; params: KeyValue[] } => {
  if (!url) {
    return { raw: "", params: [] };
  }
  if (typeof url === "string") {
    return { raw: url, params: [] };
  }
  const host = Array.isArray(url.host) ? url.host.join(".") : (url.host ?? "");
  const path = Array.isArray(url.path) ? url.path.join("/") : (url.path ?? "");
  const reconstructed = host
    ? `${url.protocol ?? "https"}://${host}${path ? `/${path.replace(/^\//, "")}` : ""}`
    : "";
  return { raw: url.raw ?? reconstructed, params: toKeyValues(url.query) };
};

/**
 * Parses a Postman Collection v2.x JSON document into local entities.
 * Throws when the document does not look like a Postman collection.
 */
export function importPostmanCollection(
  json: string,
  workspaceId: string,
): ImportedCollection {
  let parsed: PostmanCollectionFile;
  try {
    parsed = JSON.parse(json) as PostmanCollectionFile;
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  if (!parsed.info?.name || !Array.isArray(parsed.item)) {
    throw new Error(
      "This does not look like a Postman collection (missing info.name or item).",
    );
  }

  const now = new Date().toISOString();
  const collection: Collection = {
    id: newId(),
    workspaceId,
    name: parsed.info.name,
    description:
      typeof parsed.info.description === "string"
        ? parsed.info.description
        : "",
    createdAt: now,
  };
  const folders: Folder[] = [];
  const requests: ApiRequest[] = [];

  const walk = (
    items: PostmanItem[],
    parentFolderId: string | null,
    inheritedAuth?: PostmanAuth,
  ): void => {
    for (const item of items) {
      if (Array.isArray(item.item)) {
        const folder: Folder = {
          id: newId(),
          collectionId: collection.id,
          parentFolderId,
          name: item.name ?? "Folder",
          isStarred: false,
          createdAt: now,
        };
        folders.push(folder);
        walk(item.item, folder.id, inheritedAuth);
        continue;
      }
      if (!item.request) {
        continue;
      }
      const request: PostmanRequest =
        typeof item.request === "string" ? { url: item.request } : item.request;
      const method = (request.method ?? "GET").toUpperCase();
      const { raw, params } = parseUrl(request.url);
      const bodyMode = request.body?.mode;
      const isJson =
        bodyMode === "raw" &&
        request.body?.options?.raw?.language?.toLowerCase() === "json";
      requests.push({
        id: newId(),
        collectionId: collection.id,
        folderId: parentFolderId,
        name: item.name ?? raw ?? "Request",
        method: VALID_METHODS.includes(method as HttpMethod)
          ? (method as HttpMethod)
          : "GET",
        url: raw,
        params,
        headers: toKeyValues(request.header),
        bodyMode:
          bodyMode === "raw"
            ? isJson
              ? "json"
              : "raw"
            : bodyMode === "urlencoded" || bodyMode === "formdata"
              ? "form"
              : "none",
        bodyRaw: request.body?.raw ?? "",
        bodyForm: toKeyValues(
          request.body?.urlencoded ?? request.body?.formdata,
        ),
        auth: parseAuth(request.auth ?? inheritedAuth),
        createdAt: now,
      });
    }
  };

  walk(parsed.item, null, parsed.auth);
  return { collection, folders, requests };
}

const toPostmanKeyValues = (items: KeyValue[]): PostmanKeyValue[] =>
  items
    .filter((item) => item.key !== "")
    .map((item) => ({
      key: item.key,
      value: item.value,
      ...(item.enabled ? {} : { disabled: true }),
    }));

const toPostmanAuth = (auth: RequestAuth): PostmanAuth | undefined => {
  if (auth.type === "bearer") {
    return {
      type: "bearer",
      bearer: [{ key: "token", value: auth.bearerToken ?? "" }],
    };
  }
  if (auth.type === "basic") {
    return {
      type: "basic",
      basic: [
        { key: "username", value: auth.basicUsername ?? "" },
        { key: "password", value: auth.basicPassword ?? "" },
      ],
    };
  }
  return undefined;
};

const toPostmanRequest = (request: ApiRequest): PostmanItem => {
  const query = toPostmanKeyValues(request.params);
  const auth = toPostmanAuth(request.auth);
  const postmanRequest: PostmanRequest = {
    method: request.method,
    header: toPostmanKeyValues(request.headers),
    url: {
      raw: request.url,
      ...(query.length > 0 ? { query } : {}),
    },
    ...(auth ? { auth } : {}),
  };
  if (request.bodyMode === "json" || request.bodyMode === "raw") {
    postmanRequest.body = {
      mode: "raw",
      raw: request.bodyRaw,
      options: {
        raw: { language: request.bodyMode === "json" ? "json" : "text" },
      },
    };
  } else if (request.bodyMode === "form") {
    postmanRequest.body = {
      mode: "urlencoded",
      urlencoded: toPostmanKeyValues(request.bodyForm),
    };
  }
  return { name: request.name, request: postmanRequest };
};

/** Serializes a collection tree to Postman Collection v2.1 JSON. */
export function exportPostmanCollection(
  collection: Collection,
  folders: Folder[],
  requests: ApiRequest[],
): string {
  const buildLevel = (parentFolderId: string | null): PostmanItem[] => {
    const folderItems = folders
      .filter((folder) => folder.parentFolderId === parentFolderId)
      .map((folder) => ({
        name: folder.name,
        item: buildLevel(folder.id),
      }));
    const requestItems = requests
      .filter((request) => request.folderId === parentFolderId)
      .map(toPostmanRequest);
    return [...folderItems, ...requestItems];
  };

  const file: PostmanCollectionFile = {
    info: {
      name: collection.name,
      ...(collection.description
        ? { description: collection.description }
        : {}),
      schema: SCHEMA_V21,
    },
    item: buildLevel(null),
  };
  return JSON.stringify(file, null, 2);
}
