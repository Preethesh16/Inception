export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  actor: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    headers: {
      "X-Demo-Session":
        sessionStorage.getItem("inception-session-" + actor) || "demo-" + actor,
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      typeof result.detail === "string"
        ? result.detail +
            (result.errors
              ? " · " +
                result.errors
                  .map(
                    (e: { row: number; error: string }) =>
                      `Row ${e.row}: ${e.error}`,
                  )
                  .join("; ")
              : "")
        : JSON.stringify(result.detail),
      response.status,
    );
  return result;
}
export const post = <T>(path: string, actor: string, body: unknown = {}) =>
  api<T>(path, actor, { method: "POST", body: JSON.stringify(body) });
export const exportUrl = (kind: string, actor: string) =>
  `/api/exports/${kind}?session=demo-${actor}`;
export const fmt = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
export const days = (n: number | null | undefined) =>
  n == null ? "28+ days" : `${n.toFixed(1)} days`;
export const date = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
