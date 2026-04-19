import React, { createContext, useContext, useState, ReactNode } from 'react';

interface DateContextType {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
}

const DateContext = createContext<DateContextType | undefined>(undefined);

export function DateProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDate] = useState(new Date());

  return (
    <DateContext.Provider value={{ selectedDate, setSelectedDate }}>
      {children}
    </DateContext.Provider>
  );
}

export function useSelectedDate() {
  const context = useContext(DateContext);
  if (!context) {
    throw new Error('useSelectedDate must be used within DateProvider');
  }
  return context;
}
