import React from "react";
import DocumentManager from "@/components/documents/DocumentManager";

export default function Documents() {
  return (
    <DocumentManager
      eyebrow="Built-in document management"
      title="Documents"
      description="Every deliverable your advisors produce — filed, versioned and ready for review."
      emptyText="Documents created by your advisors will appear here automatically. You can also add your own."
    />
  );
}