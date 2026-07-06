import React from "react";
import DocumentLibrary from "@/components/documents/DocumentLibrary";

export default function Knowledge() {
  return (
    <DocumentLibrary kind="knowledge" allowFiles
      eyebrow="The company's memory"
      title="Knowledge Base"
      description="Everything your advisors should know before they contribute — so you never repeat yourself."
      emptyText="Add your business plan, brand guidelines, personas and more. Advisors reference these in the boardroom." />
  );
}