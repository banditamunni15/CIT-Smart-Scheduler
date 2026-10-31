export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type ApiEnvelope<T> =
  | {
      statusCode: number;
      success: true;
      message: string;
      data: T;
    }
  | {
      statusCode: number;
      success: false;
      message: string;
      code: string;
      details?: unknown;
    };

export class ApiClientError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type RequestOptions = Omit<RequestInit, "body" | "method"> & {
  body?: unknown;
};

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  let body: BodyInit | undefined;

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    method,
    headers,
    body,
    credentials: "include",
  });

  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiClientError(
      response.status,
      "INVALID_RESPONSE",
      "The server returned an invalid response.",
    );
  }

  if (!response.ok || !envelope.success) {
    if ("success" in envelope && !envelope.success) {
      throw new ApiClientError(
        envelope.statusCode,
        envelope.code,
        envelope.message,
        envelope.details,
      );
    }
    throw new ApiClientError(
      response.status,
      "REQUEST_FAILED",
      "The request could not be completed.",
    );
  }

  return envelope.data;
}

export const get = <T>(path: string, options?: Omit<RequestOptions, "body">) =>
  request<T>("GET", path, options);

export const post = <T>(path: string, body?: unknown) =>
  request<T>("POST", path, { body });

export const put = <T>(path: string, body?: unknown) =>
  request<T>("PUT", path, { body });

export const patch = <T>(path: string, body?: unknown) =>
  request<T>("PATCH", path, { body });

export const del = <T>(path: string) => request<T>("DELETE", path);
