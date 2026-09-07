import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Icon } from "./Icon";
import { Checkbox } from "./Choice";
import { EmptyState } from "./Display";
import { spring } from "../../tokens/spring";
import { cx } from "../cx";

/* ==========================================================================
   DataTable.

   Sortable, selectable, sticky-headed, density-aware. The sort indicator is
   a shared-layout element that travels between columns rather than appearing
   and disappearing, so the eye follows the sort instead of re-finding it.
   ========================================================================== */

export interface Column<Row> {
  id: string;
  header: ReactNode;
  /** Pull the cell value. Return a node to render it however you like. */
  cell: (row: Row) => ReactNode;
  /** Return a comparable primitive to make the column sortable. */
  sortBy?: (row: Row) => string | number;
  align?: "start" | "end";
  width?: number | string;
  /** Numbers should be tabular and right-aligned; this does both. */
  numeric?: boolean;
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Turns on the selection column. */
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  density?: "compact" | "default" | "comfortable";
  /** Header stays put while the body scrolls. */
  stickyHeader?: boolean;
  maxHeight?: number | string;
  empty?: ReactNode;
  onRowClick?: (row: Row) => void;
  className?: string;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  selectable = false,
  selected,
  onSelectedChange,
  density = "default",
  stickyHeader = true,
  maxHeight,
  empty,
  onRowClick,
  className,
}: DataTableProps<Row>) {
  const [sort, setSort] = useState<{ id: string; dir: "asc" | "desc" } | null>(null);
  const [internalSelected, setInternalSelected] = useState<string[]>([]);
  const picked = selected ?? internalSelected;

  const setPicked = (next: string[]) => {
    if (selected === undefined) setInternalSelected(next);
    onSelectedChange?.(next);
  };

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.id === sort.id);
    if (!column?.sortBy) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = column.sortBy!(a);
      const right = column.sortBy!(b);
      if (left === right) return 0;
      return (left > right ? 1 : -1) * factor;
    });
  }, [rows, sort, columns]);

  const allPicked = rows.length > 0 && picked.length === rows.length;

  const toggleSort = (column: Column<Row>) => {
    if (!column.sortBy) return;
    setSort((current) =>
      current?.id === column.id
        ? current.dir === "asc"
          ? { id: column.id, dir: "desc" }
          : null
        : { id: column.id, dir: "asc" },
    );
  };

  if (!rows.length) {
    return <div className={cx("cordon-table__shell", className)}>{empty ?? <EmptyState title="Nothing here yet" description="Rows will appear once there is something to show." />}</div>;
  }

  return (
    <div
      className={cx("cordon-table__shell", className)}
      data-cordon-density={density}
      style={{ maxHeight }}
    >
      <table className="cordon-table">
        <thead className={cx(stickyHeader && "cordon-table__head--sticky")}>
          <tr>
            {selectable ? (
              <th scope="col" className="cordon-table__select">
                <Checkbox
                  aria-label={allPicked ? "Clear selection" : "Select every row"}
                  checked={allPicked}
                  indeterminate={picked.length > 0 && !allPicked}
                  onChange={() => setPicked(allPicked ? [] : rows.map(rowKey))}
                />
              </th>
            ) : null}
            {columns.map((column) => {
              const active = sort?.id === column.id;
              return (
                <th
                  key={column.id}
                  /* Without it a header cell is not announced as the label for
                     the cells beneath it, which is the entire reason a table is
                     a table rather than a grid of text. */
                  scope="col"
                  style={{ width: column.width, textAlign: column.numeric || column.align === "end" ? "right" : "left" }}
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {column.sortBy ? (
                    <button
                      type="button"
                      className={cx("cordon-table__sort", active && "cordon-table__sort--active")}
                      onClick={() => toggleSort(column)}
                    >
                      <span>{column.header}</span>
                      <span className="cordon-table__sort-mark">
                        {active ? (
                          <motion.span layoutId="cordon-table-sort" transition={spring.snap}>
                            <Icon name={sort!.dir === "asc" ? "chevron-up" : "chevron-down"} />
                          </motion.span>
                        ) : (
                          <Icon name="sort" className="cordon-table__sort-idle" />
                        )}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {sorted.map((row) => {
            const id = rowKey(row);
            const isPicked = picked.includes(id);
            return (
              <tr
                key={id}
                className={cx(isPicked && "cordon-table__row--selected", onRowClick && "cordon-table__row--clickable")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {selectable ? (
                  <td className="cordon-table__select" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      aria-label={`Select row ${id}`}
                      checked={isPicked}
                      onChange={() =>
                        setPicked(isPicked ? picked.filter((x) => x !== id) : [...picked, id])
                      }
                    />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cx(column.numeric && "cordon-table__cell--numeric")}
                    style={{ textAlign: column.numeric || column.align === "end" ? "right" : "left" }}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
