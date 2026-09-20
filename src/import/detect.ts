export function detectSource(filename: string): string {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const extension = dot >= 0 ? lower.slice(dot) : "";

  switch (extension) {
    case ".json":
      return "json";
    case ".md":
    case ".markdown":
    case ".txt":
      return "notes";
    default:
      return "notes";
  }
}
