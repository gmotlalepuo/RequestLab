import type { KeyValue } from "@/src/types";

/** Keep the URL aligned with rows managed by the Params tab. */
export function syncUrlQueryParams(
  url: string,
  previousParams: KeyValue[],
  nextParams: KeyValue[],
) {
  const hashIndex = url.indexOf("#");
  const fragment = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const withoutFragment = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = withoutFragment.indexOf("?");
  const base = queryIndex >= 0 ? withoutFragment.slice(0, queryIndex) : withoutFragment;
  const search = new URLSearchParams(
    queryIndex >= 0 ? withoutFragment.slice(queryIndex + 1) : "",
  );

  const managedKeys = new Set(
    [...previousParams, ...nextParams]
      .map((item) => item.key.trim())
      .filter(Boolean),
  );
  managedKeys.forEach((key) => search.delete(key));

  nextParams.forEach((item) => {
    const key = item.key.trim();
    if (item.enabled && key) search.append(key, item.value);
  });

  // Keep RequestLab environment placeholders readable in the URL field.
  const query = search
    .toString()
    .replace(/%7B/gi, "{")
    .replace(/%7D/gi, "}");
  return `${base}${query ? `?${query}` : ""}${fragment}`;
}
