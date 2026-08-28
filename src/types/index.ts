export interface Comic {
  id: string;
  title: string;
  fileName: string;
  series?: string;
  format: 'cbz' | 'cbr' | 'pdf';
  totalPages: number;
  fileSize: number;
  coverImage?: string; // base64 or blob url
  progress: number; // percentage
  currentPage: number;
  lastRead: number; // timestamp
  fileHandle?: any; 
  fileData?: Blob | ArrayBuffer | File; 
}

export interface ReadingProgress {
  comicId: string;
  currentPage: number;
  progress: number;
  lastRead: number;
}
