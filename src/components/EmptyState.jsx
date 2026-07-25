import React from "react";

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-6 rise-in">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-secondary/70 flex items-center justify-center mb-6">
          <Icon className="w-6 h-6 text-muted-foreground" strokeWidth={1.25} />
        </div>
      )}
      <h3 className="text-2xl font-display font-light mb-2">{title}</h3>
      {description && <p className="text-muted-foreground max-w-sm leading-relaxed mb-8">{description}</p>}
      {action}
    </div>
  );
}