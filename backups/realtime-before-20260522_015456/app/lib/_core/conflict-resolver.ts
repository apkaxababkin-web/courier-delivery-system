/**
 * Conflict Resolver
 * Handles conflicts when syncing offline changes with server data
 */

export type ConflictResolutionStrategy = "last-write-wins" | "server-wins" | "manual";

export interface ConflictData {
  localVersion: any;
  serverVersion: any;
  localTimestamp: number;
  serverTimestamp: number;
  fieldDifferences: Record<string, { local: any; server: any }>;
}

export interface ConflictResolution {
  strategy: ConflictResolutionStrategy;
  resolvedData: any;
  selectedVersion: "local" | "server" | "merged";
  mergedFields?: Record<string, any>;
}

/**
 * Detect conflicts between local and server versions
 */
export function detectConflict(local: any, server: any): ConflictData | null {
  if (!local || !server) {
    return null;
  }

  const fieldDifferences: Record<string, { local: any; server: any }> = {};

  // Compare all fields
  const allKeys = new Set([...Object.keys(local), ...Object.keys(server)]);

  for (const key of allKeys) {
    if (key === "updatedAt" || key === "syncedAt") {
      continue; // Skip timestamp fields
    }

    if (JSON.stringify(local[key]) !== JSON.stringify(server[key])) {
      fieldDifferences[key] = {
        local: local[key],
        server: server[key],
      };
    }
  }

  if (Object.keys(fieldDifferences).length === 0) {
    return null; // No conflicts
  }

  return {
    localVersion: local,
    serverVersion: server,
    localTimestamp: local.updatedAt ? new Date(local.updatedAt).getTime() : 0,
    serverTimestamp: server.updatedAt ? new Date(server.updatedAt).getTime() : 0,
    fieldDifferences,
  };
}

/**
 * Resolve conflict using last-write-wins strategy
 * The version with the most recent timestamp wins
 */
export function resolveConflictLastWriteWins(conflict: ConflictData): ConflictResolution {
  const isLocalNewer = conflict.localTimestamp > conflict.serverTimestamp;

  return {
    strategy: "last-write-wins",
    resolvedData: isLocalNewer ? conflict.localVersion : conflict.serverVersion,
    selectedVersion: isLocalNewer ? "local" : "server",
  };
}

/**
 * Resolve conflict using server-wins strategy
 * Always prefer server version
 */
export function resolveConflictServerWins(conflict: ConflictData): ConflictResolution {
  return {
    strategy: "server-wins",
    resolvedData: conflict.serverVersion,
    selectedVersion: "server",
  };
}

/**
 * Resolve conflict using smart merge strategy
 * Merge fields intelligently based on type and importance
 */
export function resolveConflictSmartMerge(conflict: ConflictData): ConflictResolution {
  const merged = { ...conflict.serverVersion };
  const mergedFields: Record<string, any> = {};

  // Merge strategy by field
  for (const [field, diff] of Object.entries(conflict.fieldDifferences)) {
    // Critical fields: always use server version
    if (["id", "createdAt", "status"].includes(field)) {
      merged[field] = diff.server;
      mergedFields[field] = diff.server;
      continue;
    }

    // User-editable fields: use most recent
    if (["title", "address", "recipientName", "notes"].includes(field)) {
      const isLocalNewer = conflict.localTimestamp > conflict.serverTimestamp;
      merged[field] = isLocalNewer ? diff.local : diff.server;
      mergedFields[field] = isLocalNewer ? diff.local : diff.server;
      continue;
    }

    // For other fields, use local if it's more recent
    const isLocalNewer = conflict.localTimestamp > conflict.serverTimestamp;
    merged[field] = isLocalNewer ? diff.local : diff.server;
    mergedFields[field] = isLocalNewer ? diff.local : diff.server;
  }

  return {
    strategy: "last-write-wins",
    resolvedData: merged,
    selectedVersion: "merged",
    mergedFields,
  };
}

/**
 * Resolve conflict based on strategy
 */
export function resolveConflict(
  conflict: ConflictData,
  strategy: ConflictResolutionStrategy = "last-write-wins"
): ConflictResolution {
  console.log("[ConflictResolver] Resolving conflict using strategy:", strategy);

  switch (strategy) {
    case "server-wins":
      return resolveConflictServerWins(conflict);

    case "last-write-wins":
      return resolveConflictLastWriteWins(conflict);

    case "manual":
      // Manual resolution should be handled by UI
      return {
        strategy: "manual",
        resolvedData: null,
        selectedVersion: "local",
      };

    default:
      return resolveConflictLastWriteWins(conflict);
  }
}

/**
 * Get conflict summary for UI display
 */
export function getConflictSummary(conflict: ConflictData): {
  title: string;
  description: string;
  changedFields: string[];
  recommendation: string;
} {
  const changedFields = Object.keys(conflict.fieldDifferences);
  const isLocalNewer = conflict.localTimestamp > conflict.serverTimestamp;

  return {
    title: "Data Conflict Detected",
    description: `The task was modified both locally and on the server. ${changedFields.length} field(s) have different values.`,
    changedFields,
    recommendation: isLocalNewer
      ? "Your local changes are more recent. They will be used."
      : "Server changes are more recent. They will be used.",
  };
}

/**
 * Format conflict data for logging
 */
export function logConflict(conflict: ConflictData, taskId?: number): void {
  console.warn("[ConflictResolver] Conflict detected", {
    taskId,
    changedFields: Object.keys(conflict.fieldDifferences),
    localTimestamp: new Date(conflict.localTimestamp).toISOString(),
    serverTimestamp: new Date(conflict.serverTimestamp).toISOString(),
    differences: conflict.fieldDifferences,
  });
}

/**
 * Merge multiple conflicts (for batch operations)
 */
export function mergeConflicts(
  conflicts: ConflictData[],
  strategy: ConflictResolutionStrategy = "last-write-wins"
): ConflictResolution[] {
  return conflicts.map((conflict) => resolveConflict(conflict, strategy));
}

/**
 * Check if conflict is critical (involves status or id)
 */
export function isCriticalConflict(conflict: ConflictData): boolean {
  const criticalFields = ["id", "status", "createdAt"];
  return criticalFields.some((field) => field in conflict.fieldDifferences);
}

/**
 * Get conflict statistics
 */
export function getConflictStats(conflicts: ConflictData[]): {
  totalConflicts: number;
  criticalConflicts: number;
  totalChangedFields: number;
  mostCommonFields: string[];
} {
  const criticalConflicts = conflicts.filter(isCriticalConflict).length;
  const allChangedFields: Record<string, number> = {};
  let totalChangedFields = 0;

  for (const conflict of conflicts) {
    for (const field of Object.keys(conflict.fieldDifferences)) {
      allChangedFields[field] = (allChangedFields[field] || 0) + 1;
      totalChangedFields++;
    }
  }

  const mostCommonFields = Object.entries(allChangedFields)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([field]) => field);

  return {
    totalConflicts: conflicts.length,
    criticalConflicts,
    totalChangedFields,
    mostCommonFields,
  };
}
