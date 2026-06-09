import { createContext, useContext, useState, type ReactNode } from "react";

interface DemoContextValue {
  speed: 1 | 10 | 100;
  setSpeed: (s: 1 | 10 | 100) => void;
  currentStep: number;
  goToStep: (n: number) => void;
  isDemoMode: boolean;
  setDemoMode: (on: boolean) => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [speed, setSpeed] = useState<1 | 10 | 100>(1);
  const [currentStep, setCurrentStep] = useState(1);
  const [isDemoMode, setDemoMode] = useState(false);

  const goToStep = (n: number) => {
    if (n >= 1 && n <= 8) setCurrentStep(n);
  };

  return (
    <DemoContext.Provider value={{ speed, setSpeed, currentStep, goToStep, isDemoMode, setDemoMode }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}
