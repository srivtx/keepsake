function serialize(value: unknown): string {
  if (value === null || value === undefined) return "null";

  const kind = typeof value;

  if (kind === "number") {
    return JSON.stringify(Number.isFinite(value as number) ? value : null);
  }
  if (kind === "boolean") return value ? "true" : "false";
  if (kind === "string") return JSON.stringify(value);
  if (kind === "bigint") return JSON.stringify(value.toString());

  if (Array.isArray(value)) {
    const items = value.map((item) => serialize(item === undefined ? null : item));
    return `[${items.join(",")}]`;
  }

  if (kind === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const item = record[key];
      if (item === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${serialize(item)}`);
    }
    return `{${parts.join(",")}}`;
  }

  return "null";
}

export function canonicalJson(value: unknown): string {
  return serialize(value);
}
