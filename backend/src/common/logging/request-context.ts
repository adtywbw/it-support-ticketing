import { AsyncLocalStorage } from "async_hooks";

/** Correlation ID store scoped to each HTTP request lifecycle. */
export const requestContext = new AsyncLocalStorage<{
  correlationId: string;
}>();

/** Retrieve the current request's correlation ID. */
export function getCorrelationId(): string {
  return requestContext.getStore()?.correlationId ?? "no-request";
}
