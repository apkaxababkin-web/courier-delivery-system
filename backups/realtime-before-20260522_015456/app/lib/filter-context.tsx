import React, { createContext, useContext, useState } from "react";

type FilterMode = "all" | "mine";

interface FilterContextType {
  filterMode: FilterMode;
  setFilterMode: (mode: FilterMode) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  return (
    <FilterContext.Provider value={{ filterMode, setFilterMode }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error("useFilter must be used within FilterProvider");
  }
  return context;
}
