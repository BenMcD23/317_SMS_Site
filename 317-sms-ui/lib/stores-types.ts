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
}

export interface Order {
  id: string;
  cadetName: string;
  timestamp: string;
  needSizing: boolean;
  items: OrderItem[];
}

export interface StoresData {
  stock: StockItem[];
  orders: Order[];
}
