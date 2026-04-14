export interface BoxSection {
  label: string;
  position: number;
  row: number;
  sectionWidth: number;
}

export interface ShelfBox {
  label: string;
  shelfLevel: 0 | 1 | 2 | 3;
  shelfPosition: number;
  boxWidth: number;
  topEnd: "left" | "right";
  sections: BoxSection[];
}

export interface ShelfStructure {
  boxes: ShelfBox[];
}

export interface StockItem {
  id: string;
  itemType: string;
  size: string;
  box: string;      // "A", "B", "C", etc.
  section: string;  // "1", "2", "3", etc.
  quantity: number;
  gender: string;   // "male" | "female" | "unisex"
}

export interface QmNote {
  id: string;
  content: string;
  timestamp: string;
  addedBy: string;
}

export interface OrderItem {
  id: string;
  itemType: string;
  size: string;
  needSizing: boolean;
  sizingDetails: string;
  qmNotes: QmNote[];
}

export interface Order {
  id: string;
  cadetName: string;
  cadetCin: number;
  timestamp: string;
  items: OrderItem[];
}
