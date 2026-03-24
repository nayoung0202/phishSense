"use client";

import { Button } from "@/components/ui/button";

type ListPaginationControlsProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
};

export function ListPaginationControls({
  page,
  totalPages,
  onPageChange,
  previousLabel,
  nextLabel,
}: ListPaginationControlsProps) {
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {previousLabel}
      </Button>
      <span className="text-sm text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {nextLabel}
      </Button>
    </div>
  );
}
