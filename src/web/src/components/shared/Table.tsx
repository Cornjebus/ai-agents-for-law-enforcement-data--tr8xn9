import React, { useCallback, useMemo, useState } from 'react'; // v18.0+
import { useVirtual } from 'react-virtual'; // v3.0+
import { debounce } from 'lodash-es'; // v4.17+
import { ErrorBoundary } from 'react-error-boundary'; // v4.0+
import clsx from 'clsx'; // v2.0+
import { Loading } from './Loading';
import { Pagination } from './Pagination';
import { Dropdown } from './Dropdown';
import { DESIGN_SYSTEM } from '../../lib/constants';

// Type Definitions
type SortDirection = 'asc' | 'desc' | null;
type ExportFormat = 'csv' | 'excel' | 'pdf';

interface TableColumn {
  key: string;
  title: string | React.ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  width?: string | number;
  minWidth?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  fixed?: 'left' | 'right' | false;
  render?: (value: any, row: any, index: number) => React.ReactNode;
  filterOptions?: FilterOption[];
  sortComparator?: (a: any, b: any) => number;
}

interface FilterOption {
  value: string | number;
  label: string;
}

interface TableProps {
  columns: TableColumn[];
  data: any[];
  loading?: boolean;
  error?: Error | null;
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  selectable?: boolean;
  virtualized?: boolean;
  stickyHeader?: boolean;
  pagination?: boolean;
  pageSize?: number;
  rowKey?: string | ((row: any) => string);
  onSort?: (key: string, direction: SortDirection) => void;
  onFilter?: (filters: Record<string, any>) => void;
  onSelect?: (selectedRows: any[]) => void;
  onResize?: (column: string, width: number) => void;
  onExport?: (format: ExportFormat) => void;
  className?: string;
  style?: React.CSSProperties;
}

// Custom Hooks
const useTableSort = (
  columns: TableColumn[],
  data: any[],
  onSort?: (key: string, direction: SortDirection) => void
) => {
  const [sortState, setSortState] = useState<{ key: string; direction: SortDirection }>({
    key: '',
    direction: null
  });

  const sortedData = useMemo(() => {
    if (!sortState.key || !sortState.direction) return data;

    const column = columns.find(col => col.key === sortState.key);
    if (!column?.sortable) return data;

    const comparator = column.sortComparator || ((a: any, b: any) => {
      const aVal = a[sortState.key];
      const bVal = b[sortState.key];
      if (aVal === bVal) return 0;
      return aVal > bVal ? 1 : -1;
    });

    return [...data].sort((a, b) => {
      const result = comparator(a, b);
      return sortState.direction === 'asc' ? result : -result;
    });
  }, [data, columns, sortState]);

  const handleSort = useCallback(debounce((key: string) => {
    setSortState(prev => {
      const newDirection: SortDirection = 
        prev.key === key
          ? prev.direction === 'asc'
            ? 'desc'
            : prev.direction === 'desc'
              ? null
              : 'asc'
          : 'asc';

      onSort?.(key, newDirection);
      return { key, direction: newDirection };
    });
  }, 200), [onSort]);

  return { sortedData, sortState, handleSort };
};

const useTableSelection = (
  data: any[],
  rowKey: string | ((row: any) => string),
  onSelect?: (selectedRows: any[]) => void
) => {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const getRowKey = useCallback((row: any): string => {
    return typeof rowKey === 'function' ? rowKey(row) : row[rowKey];
  }, [rowKey]);

  const handleSelect = useCallback((row: any) => {
    setSelectedRows(prev => {
      const key = getRowKey(row);
      const newSelection = new Set(prev);
      if (newSelection.has(key)) {
        newSelection.delete(key);
      } else {
        newSelection.add(key);
      }
      onSelect?.(data.filter(r => newSelection.has(getRowKey(r))));
      return newSelection;
    });
  }, [data, getRowKey, onSelect]);

  const handleSelectAll = useCallback((checked: boolean) => {
    setSelectedRows(prev => {
      const newSelection = checked
        ? new Set(data.map(getRowKey))
        : new Set();
      onSelect?.(checked ? data : []);
      return newSelection;
    });
  }, [data, getRowKey, onSelect]);

  return { selectedRows, handleSelect, handleSelectAll };
};

// Main Component
const Table = React.forwardRef<HTMLDivElement, TableProps>(({
  columns,
  data,
  loading = false,
  error = null,
  sortable = true,
  filterable = true,
  resizable = true,
  selectable = false,
  virtualized = false,
  stickyHeader = true,
  pagination = true,
  pageSize = 10,
  rowKey = 'id',
  onSort,
  onFilter,
  onSelect,
  onResize,
  onExport,
  className,
  style
}, ref) => {
  // State and Hooks
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const { sortedData, sortState, handleSort } = useTableSort(columns, data, onSort);
  const { selectedRows, handleSelect, handleSelectAll } = useTableSelection(data, rowKey, onSelect);

  // Virtual scroll configuration
  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtual({
    size: sortedData.length,
    parentRef,
    estimateSize: useCallback(() => 48, []),
    overscan: 5
  });

  // Pagination calculations
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = pagination
    ? sortedData.slice((page - 1) * pageSize, page * pageSize)
    : sortedData;

  // Column resize handler
  const handleColumnResize = useCallback((columnKey: string, width: number) => {
    setColumnWidths(prev => ({ ...prev, [columnKey]: width }));
    onResize?.(columnKey, width);
  }, [onResize]);

  // Filter handler
  const handleFilter = useCallback((columnKey: string, value: any) => {
    setFilters(prev => {
      const newFilters = { ...prev, [columnKey]: value };
      onFilter?.(newFilters);
      return newFilters;
    });
  }, [onFilter]);

  // Render functions
  const renderHeader = useCallback((column: TableColumn) => {
    const width = columnWidths[column.key] || column.width;
    const sortIcon = column.sortable && (
      <span className={clsx(
        'ml-2 transition-transform',
        sortState.key === column.key && sortState.direction === 'desc' && 'transform rotate-180'
      )}>
        ↑
      </span>
    );

    return (
      <th
        key={column.key}
        className={clsx(
          'px-4 py-3 font-semibold text-sm text-gray-900',
          'border-b border-gray-200',
          column.align === 'center' && 'text-center',
          column.align === 'right' && 'text-right',
          stickyHeader && 'sticky top-0 bg-white z-10',
          column.fixed && `sticky ${column.fixed}-0 z-20`
        )}
        style={{
          width,
          minWidth: column.minWidth,
          maxWidth: column.maxWidth
        }}
      >
        <div className="flex items-center justify-between">
          <span>{column.title}</span>
          {column.sortable && sortIcon}
          {column.filterable && column.filterOptions && (
            <Dropdown
              options={column.filterOptions}
              value={filters[column.key] || ''}
              onChange={(value) => handleFilter(column.key, value)}
              className="ml-2"
              width="sm"
            />
          )}
          {resizable && column.resizable && (
            <div
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-500"
              onMouseDown={(e) => {
                // Column resize logic
              }}
            />
          )}
        </div>
      </th>
    );
  }, [sortState, filters, columnWidths, handleFilter, stickyHeader, resizable]);

  const renderRow = useCallback((row: any, rowIndex: number) => {
    const rowKey = typeof rowKey === 'function' ? rowKey(row) : row[rowKey];
    const isSelected = selectedRows.has(rowKey);

    return (
      <tr
        key={rowKey}
        className={clsx(
          'hover:bg-gray-50 transition-colors',
          isSelected && 'bg-primary-50',
          rowIndex % 2 === 0 && 'bg-gray-50'
        )}
      >
        {selectable && (
          <td className="px-4 py-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleSelect(row)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
          </td>
        )}
        {columns.map(column => (
          <td
            key={column.key}
            className={clsx(
              'px-4 py-3 text-sm',
              column.align === 'center' && 'text-center',
              column.align === 'right' && 'text-right',
              column.fixed && `sticky ${column.fixed}-0`
            )}
          >
            {column.render
              ? column.render(row[column.key], row, rowIndex)
              : row[column.key]}
          </td>
        ))}
      </tr>
    );
  }, [columns, selectable, selectedRows, handleSelect]);

  // Error Boundary fallback
  const ErrorFallback = ({ error }: { error: Error }) => (
    <div className="p-4 text-error-500">
      <h3 className="font-semibold">Error loading table data</h3>
      <p>{error.message}</p>
    </div>
  );

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div
        ref={ref}
        className={clsx(
          'relative overflow-hidden rounded-lg border border-gray-200',
          className
        )}
        style={style}
      >
        {loading && (
          <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center">
            <Loading size="lg" />
          </div>
        )}

        <div
          ref={parentRef}
          className="overflow-auto"
          style={{ maxHeight: virtualized ? '400px' : undefined }}
        >
          <table className="w-full border-collapse table-auto">
            <thead>
              <tr>
                {selectable && (
                  <th className="px-4 py-3 border-b border-gray-200">
                    <input
                      type="checkbox"
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                )}
                {columns.map(renderHeader)}
              </tr>
            </thead>
            <tbody>
              {virtualized
                ? rowVirtualizer.virtualItems.map(virtualRow => (
                    renderRow(sortedData[virtualRow.index], virtualRow.index)
                  ))
                : paginatedData.map((row, index) => renderRow(row, index))}
            </tbody>
          </table>
        </div>

        {pagination && totalPages > 1 && (
          <div className="border-t border-gray-200 px-4 py-3">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              className="justify-end"
            />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
});

Table.displayName = 'Table';

export default Table;