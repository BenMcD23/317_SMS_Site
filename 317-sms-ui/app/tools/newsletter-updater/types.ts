export interface Newsletter {
  id: string;
  title: string;
  date: string;
  issue: number;
  description: string;
  pdfPath: string;
  coverColor?: string;
}
