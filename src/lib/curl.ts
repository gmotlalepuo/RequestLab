import { newId } from "./id";
import type { ApiRequest, HttpMethod, KeyValue } from "../types";

const methods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const tokenize = (input: string): string[] => {
  const tokens: string[] = [];
  let token = "";
  let quote = "";
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      if (char === quote) quote = "";
      else if (char === "\\" && quote === '"' && i + 1 < input.length) token += input[++i];
      else token += char;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === "\\" && i + 1 < input.length) token += input[++i];
    else if (/\s/.test(char)) { if (token) { tokens.push(token); token = ""; } }
    else token += char;
  }
  if (token) tokens.push(token);
  return tokens;
};

const optionValue = (tokens: string[], index: number): [string, number] => {
  const value = tokens[index + 1] ?? "";
  return [value, index + 1];
};

const keyValue = (key: string, value: string): KeyValue => ({ id: newId(), key, value, enabled: true });

const splitCommands = (text: string): string[] => {
  const normalized = text.replace(/\\\r?\n/g, " ").replace(/\r/g, "");
  const lines = normalized.split(/\n(?=\s*curl(?:\s|$))/i);
  return lines.map((line) => line.trim()).filter((line) => /(^|\s)curl(?:\s|$)/i.test(line));
};

/** Parse one or more shell cURL commands into editable RequestLab requests. */
export function importCurlCommands(text: string, collectionId: string, folderId: string | null): ApiRequest[] {
  return splitCommands(text).map((command, commandIndex) => {
    const tokens = tokenize(command).filter((token, index) => !(index === 0 && token.toLowerCase() === "curl"));
    let method: HttpMethod = "GET";
    let url = "";
    let bodyRaw = "";
    let bodyMode: ApiRequest["bodyMode"] = "none";
    let headers: KeyValue[] = [];
    let bodyForm: KeyValue[] = [];
    let basicUsername = "";
    let basicPassword = "";
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === "-X" || token === "--request") { const [value, next] = optionValue(tokens, i); i = next; const candidate = value.toUpperCase(); if (methods.includes(candidate as HttpMethod)) method = candidate as HttpMethod; continue; }
      if (token === "-H" || token === "--header") { const [value, next] = optionValue(tokens, i); i = next; const separator = value.indexOf(":"); if (separator > 0) headers.push(keyValue(value.slice(0, separator).trim(), value.slice(separator + 1).trim())); continue; }
      if (token === "-d" || token === "--data" || token === "--data-raw" || token === "--data-binary") { const [value, next] = optionValue(tokens, i); i = next; bodyRaw = value; if (method === "GET") method = "POST"; bodyMode = "raw"; continue; }
      if (token === "-F" || token === "--form" || token === "--form-string") { const [value, next] = optionValue(tokens, i); i = next; const separator = value.indexOf("="); if (separator > 0) { const key = value.slice(0, separator); const raw = value.slice(separator + 1); const file = raw.startsWith("@"); bodyForm.push({ ...keyValue(key, file ? raw.slice(1).split("/").pop() ?? raw.slice(1) : raw), ...(file ? { fileName: raw.slice(1).split("/").pop() } : {}) }); } if (method === "GET") method = "POST"; bodyMode = "form"; continue; }
      if (token === "-u" || token === "--user") { const [value, next] = optionValue(tokens, i); i = next; const separator = value.indexOf(":"); basicUsername = separator >= 0 ? value.slice(0, separator) : value; basicPassword = separator >= 0 ? value.slice(separator + 1) : ""; continue; }
      if (token.startsWith("http://") || token.startsWith("https://")) url = token;
    }
    if (bodyMode === "raw" && headers.some((header) => header.key.toLowerCase() === "content-type" && header.value.toLowerCase().includes("json"))) bodyMode = "json";
    const path = (() => { try { return new URL(url).pathname.split("/").filter(Boolean).pop() ?? ""; } catch { return ""; } })();
    return { id: newId(), collectionId, folderId, name: path || `Imported request ${commandIndex + 1}`, method, url, params: [], headers, bodyMode, bodyRaw, bodyForm, auth: basicUsername ? { type: "basic", basicUsername, basicPassword } : { type: "none" }, createdAt: new Date().toISOString() };
  });
}
