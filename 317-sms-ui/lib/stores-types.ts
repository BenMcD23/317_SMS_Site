export interface StockItem {
  id: string;
  itemType: string;
  size: string;
  box: string;      // "A", "B", "C", etc.
  section: string;  // "1", "2", "3", etc.
  quantity: number;
}

export interface OrderItem {
  id: string;
  itemType: string;
  size: string;
  needSizing: boolean;
}

export interface Order {
  id: string;
  cadetName: string;
  timestamp: string;
  items: OrderItem[];
}

export interface StoresData {
  structure: Record<string, string[]>; // box label → ordered section labels
  stock: StockItem[];
  orders: Order[];
}
