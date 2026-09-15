/**
 * `lucide-react` replacement for the DOM component tests.
 *
 * The package lives inside courier-manager and is linked against the manager's own
 * React build, while these tests render with the repository root React. Two React
 * copies in one process make every hook fail with a null dispatcher, so the icons
 * (pure decoration for navigation) are replaced by empty components.
 *
 * Aliased in vitest.config.ts. Named exports are explicit so bundlers keep them.
 */
import type { ComponentType } from "react";

const Icon: ComponentType<Record<string, unknown>> = () => null;

export {
  Icon as Activity,
  Icon as AlertCircle,
  Icon as AlertTriangle,
  Icon as ArrowLeft,
  Icon as Ban,
  Icon as CalendarDays,
  Icon as Check,
  Icon as CheckCircle2,
  Icon as ChevronDown,
  Icon as Download,
  Icon as FileSpreadsheet,
  Icon as FileText,
  Icon as Pencil,
  Icon as Paperclip,
  Icon as RefreshCcw,
  Icon as RefreshCw,
  Icon as ScrollText,
  Icon as Search,
  Icon as Settings2,
  Icon as Table2,
  Icon as Wallet,
};
