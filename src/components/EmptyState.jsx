import React from "react";

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6 rise-in">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-5">
          <Icon className="w-7 h-7 text-muted-foreground" strokeWidth={1.5} />
        </div>
      )}
      <h3 className="text-xl font-display mb-2">{title}</h3>
      {description && <p className="text-muted-foreground max-w-sm mb-6">{description}</p>}
      {action}
    </div>
  );
}