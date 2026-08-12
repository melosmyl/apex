import React from "react";

export default function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6 rise-in">
      <h3 className="text-xl font-display mb-2">{title}</h3>
      {description && <p className="text-muted-foreground max-w-sm mb-6">{description}</p>}
      {action}
    </div>
  );
}