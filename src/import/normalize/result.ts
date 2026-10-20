// Every normalizer returns the value plus the rule codes that fired (task 1.4).
export type Normalized<T> = { value: T | null; codes: string[] };
