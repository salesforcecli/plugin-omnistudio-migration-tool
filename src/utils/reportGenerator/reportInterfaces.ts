export interface TableHeaderCell {
  label: string;
  colspan?: number;
  rowspan?: number;
  key: string;
  width?: string;
}

export interface TableColumn<T> {
  key: string;
  cell: (row: T) => string;
  filterValue: (row: T) => string | number;
  title?: (row: T) => string;
}

export interface Filter {
  label: string;
  key: string;
  filterOptions: string[];
}

export interface ReportHeader {
  key: string;
  value: string;
}
