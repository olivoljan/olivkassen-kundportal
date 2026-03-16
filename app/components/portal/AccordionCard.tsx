import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface AccordionCardProps {
  title: ReactNode;
  summary?: ReactNode;
  summaryRight?: ReactNode; // NEW
  rightElement?: ReactNode;
  openHeader?: ReactNode;
  cardClassName?: string;
  chevronClassName?: string;
  isOpen: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

export function AccordionCard({
  title,
  summary,
  summaryRight,
  rightElement,
  openHeader,
  cardClassName,
  chevronClassName,
  isOpen,
  onToggle,
  children,
}: AccordionCardProps) {
  return (
    <div className={cn("rounded-2xl bg-card shadow-sm overflow-hidden", cardClassName)}>
      <button
        onClick={onToggle}
        className="flex w-full items-start justify-between p-6 text-left"
      >
        {/* LEFT SIDE */}
        <div className="flex-1 min-w-0 space-y-1">

          {/* Title row */}
          <h2 className="text-[20px] font-extrabold tracking-[-0.3px] text-foreground">
            {title}
          </h2>

          {/* Summary row */}
          {!isOpen && summary && (
            <div className="flex items-center justify-between">

              <div className="text-base text-muted-foreground truncate">
                {summary}
              </div>

              {summaryRight && (
                <div className="ml-4 shrink-0">
                  {summaryRight}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT SIDE */}
        <div className="flex items-center gap-4 ml-6 shrink-0">
          {!isOpen && rightElement}
          <ChevronDown
            className={cn(
              "h-5 w-5 transition-transform duration-300",
              isOpen && "rotate-180",
              chevronClassName ?? "text-muted-foreground"
            )}
          />
        </div>
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className={cn("transition-all", isOpen ? "overflow-visible" : "overflow-hidden")}>
          <div className="px-6 pb-6">
            {openHeader && <div className="mb-6">{openHeader}</div>}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}