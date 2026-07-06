import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { base44 } from "@/api/base44Client";
import { KanbanSquare } from "lucide-react";
import EmptyState from "@/components/EmptyState";

const COLUMNS = [
  { key: "in_progress", label: "In Progress", dot: "bg-emerald-400" },
  { key: "review", label: "Review", dot: "bg-amber-400" },
  { key: "done", label: "Done", dot: "bg-blue-400" },
];

export default function ProjectKanban({ tasks, projects, onTasksChange }) {
  const [local, setLocal] = useState(tasks);
  useEffect(() => { setLocal(tasks); }, [tasks]);

  const projectName = (id) => projects.find((p) => p.id === id)?.name || "No project";

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination || source.droppableId === destination.droppableId) return;
    const next = destination.droppableId;
    setLocal((prev) => prev.map((t) => (t.id === draggableId ? { ...t, status: next } : t)));
    try {
      await base44.entities.Task.update(draggableId, { status: next });
      onTasksChange();
    } catch {
      setLocal(tasks);
    }
  };

  const visible = local.filter((t) => COLUMNS.some((c) => c.key === t.status));

  if (visible.length === 0) {
    return <EmptyState icon={KanbanSquare} title="Nothing in the workflow yet" description="Tasks in In Progress, Review, or Done will appear here to drag and drop." />;
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const colItems = local.filter((t) => t.status === col.key);
          return (
            <Droppable droppableId={col.key} key={col.key}>
              {(provided, snapshot) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className={`rounded-2xl border border-border/70 bg-secondary/40 p-3 min-h-[240px] transition-colors ${snapshot.isDraggingOver ? "bg-secondary/70" : ""}`}>
                  <div className="flex items-center gap-2 px-2 mb-3">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className="text-sm font-medium">{col.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{colItems.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[40px]">
                    {colItems.map((t, index) => (
                      <Draggable key={t.id} draggableId={t.id} index={index}>
                        {(prov, snap) => (
                          <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps} className={`bg-card border border-border/70 rounded-xl p-3 rise-in ${snap.isDragging ? "shadow-lg ring-1 ring-ring/30" : ""}`}>
                            <p className="text-sm font-medium leading-snug">{t.title}</p>
                            <div className="flex items-center justify-between gap-2 mt-2">
                              <span className="text-xs text-muted-foreground truncate">{projectName(t.project_id)}</span>
                              {t.assigned_to && <span className="text-xs text-muted-foreground shrink-0">{t.assigned_to}</span>}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          );
        })}
      </div>
    </DragDropContext>
  );
}