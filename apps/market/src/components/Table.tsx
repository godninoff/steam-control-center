import { Column } from "../helpers/table-config";

const th =
  "px-4 py-3 text-slate-400 uppercase font-semibold tracking-wider whitespace-nowrap";

const td = "px-4 py-3";

export const Table = <T extends { id: string }>({
  columns,
  rows,
  rowClassName,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  rowClassName?: (row: T) => string;
  onRowClick?: (row: T) => void;
}) => (
  <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-800 bg-slate-900">
          {columns.map((col) => (
            <th key={col.key} className={`${th} ${col.align}`}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>

      <tbody className="divide-y divide-slate-800">
        {rows.map((row) => {
          const rowClass = rowClassName?.(row) ?? "";

          return (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={`transition-colors hover:bg-slate-900 ${onRowClick ? "cursor-pointer" : ""}`}
            >
              {columns.map((col, index) => (
                <td
                  key={col.key}
                  className={`${td} ${col.align} ${index === 0 ? rowClass : ""}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          );
        })}

        {rows.length === 0 && (
          <tr>
            <td
              colSpan={columns.length}
              className={`${td} text-center text-slate-500`}
            >
              Нет данных
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);
