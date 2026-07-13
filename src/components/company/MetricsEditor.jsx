import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus, X } from "lucide-react";

export default function MetricsEditor({ metrics = [], onChange }) {
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [trend, setTrend] = useState("up");

  const add = () => {
    if (!label.trim() || !value.trim()) return;
    onChange([...metrics, { label: label.trim(), value: value.trim(), trend }]);
    setLabel(""); setValue(""); setTrend("up");
  };

  const remove = (i) => onChange(metrics.filter((_, j) => j !== i));

  return (
    <div>
      <Label className="mb-1.5 block">Key metrics</Label>
      <div className="space-y-2 mb-2">
        {metrics.map((m, i) => (
          <div key={i} className="flex items-center gap-2 bg-secondary/60 rounded-lg px-3 py-2">
            <span className="text-sm flex-1 truncate">{m.label}</span>
            <span className="text-sm font-medium text-muted-foreground">{m.value}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.trend}</span>
            <button onClick={() => remove(i)}><X className="w-4 h-4 text-muted-foreground hover:text-destructive" /></button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Metric (e.g. MRR)" className="flex-1 min-w-[120px]" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" className="w-28" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <Select value={trend} onValueChange={setTrend}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="up">Up</SelectItem>
            <SelectItem value="down">Down</SelectItem>
            <SelectItem value="flat">Flat</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={add}><Plus className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}