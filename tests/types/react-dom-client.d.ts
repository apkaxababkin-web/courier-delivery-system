/**
 * `react-dom/client` types for the DOM component tests.
 *
 * The manager app resolves this subpath through its own tsconfig, but the root
 * program has no `@types/react-dom`, so TypeScript would treat it as `any`. This
 * declaration re-exports the real ReactDOM types instead of duplicating them.
 */
declare module "react-dom/client" {
  import type { ReactNode } from "react";
  import type * as ReactDOM from "react-dom";

  /** Options accepted by `createRoot` (the ones used in tests). */
  export interface RootOptions {
    identifierPrefix?: string;
    onRecoverableError?: (error: unknown, errorInfo: unknown) => void;
  }

  /** Minimal shape of the React 19 root object. */
  export interface Root {
    render(children: ReactNode): void;
    unmount(): void;
  }

  export function createRoot(container: Element | DocumentFragment, options?: RootOptions): Root;
  export function hydrateRoot(container: Element | DocumentFragment, initialChildren: ReactNode, options?: RootOptions): Root;

  export type { ReactDOM };
}
