import React from "react";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DEPARTMENTS, departmentOf } from "@/lib/departments";
import "@/styles/taskBoard.css";

// A task's department as a chip in its partner colour (Workstream T). With
// onChange, the chip opens a menu to move the task to another department.
export function DepartmentTag({ department, className = "" }) {
  const d = departmentOf(department);
  return (
    <span className={`dept-chip ${className}`} style={{ background: d.chip, color: d.chipText }}>
      {d.label}
    </span>
  );
}

export default function DepartmentChip({ department, onChange, disabled }) {
  const d = departmentOf(department);
  if (!onChange) return <DepartmentTag department={department} />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="dept-chip dept-chip--button"
        style={{ background: d.chip, color: d.chipText }}
        aria-label={`Department: ${d.label}. Change department`}
      >
        {d.label}
        <ChevronDown className="w-3 h-3" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10rem]">
        <DropdownMenuRadioGroup value={d.key} onValueChange={(key) => key !== d.key && onChange(key)}>
          {DEPARTMENTS.map((opt) => (
            <DropdownMenuRadioItem key={opt.key} value={opt.key} className="gap-2">
              <span className="inline-block w-3 h-3 rounded-sm border border-foreground" style={{ background: opt.band }} aria-hidden="true" />
              {opt.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
