import React from "react";
import DocumentLibrary from "@/components/documents/DocumentLibrary";

export default function Documents() {
  return (
    <DocumentLibrary kind="document"
      eyebrow="Built-in document management"
      title="Documents"
      description="Business plans, decks, strategies and contracts — kept in one elegant place."
      emptyText="Create your first document to keep your company's working papers together." />
  );
}