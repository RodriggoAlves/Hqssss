import JSZip from 'jszip';
import { Archive } from 'libarchive.js';
import { naturalSort } from '../utils/naturalSort';

Archive.init({
    workerUrl: '/libarchive/worker-bundle.js'
});

export class ComicParser {
  data: File | ArrayBuffer | Blob;
  isRar: boolean = false;
  
  // For CBZ
  zip: JSZip | null = null;
  pageFilesZip: JSZip.JSZipObject[] = [];
  
  // For CBR
  rar: any | null = null;
  pageFilesRar: any[] = [];
  
  constructor(data: File | ArrayBuffer | Blob, fileName: string = '') {
    this.data = data;
    this.isRar = fileName.toLowerCase().endsWith('.cbr') || fileName.toLowerCase().endsWith('.rar');
  }

  async load(): Promise<void> {
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

    if (this.isRar) {
      const blob = this.data instanceof Blob ? this.data : new Blob([this.data]);
      
      this.rar = await Promise.race([
        Archive.open(blob as File),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout ao ler o RAR (CBR) pelo LibArchive.")), 20000))
      ]);
      
      const extracted = await this.rar.extractFiles();
      const files: any[] = [];
      
      const traverse = (obj: any, depth = 0) => {
        if (!obj || typeof obj !== 'object' || depth > 10) return;
        for (const key of Object.keys(obj)) {
          const item = obj[key];
          // Duck typing for File/Blob from WebWorker context
          if (item && item.name !== undefined && item.size !== undefined && typeof item.slice === 'function') {
            const lowerName = item.name.toLowerCase();
            if (!lowerName.includes('__macosx') && !lowerName.startsWith('.')) {
              if (validExtensions.some(ext => lowerName.endsWith(ext))) {
                files.push({ name: item.name, file: item });
              }
            }
          } else {
            traverse(item, depth + 1);
          }
        }
      };
      traverse(extracted);
      
      this.pageFilesRar = files.sort((a, b) => naturalSort(a.name, b.name));
    } else {
      this.zip = await JSZip.loadAsync(this.data as Blob);
      const files = Object.values(this.zip.files).filter(file => {
        if (file.dir) return false;
        const lowerName = file.name.toLowerCase();
        if (lowerName.includes('__macosx') || lowerName.split('/').pop()?.startsWith('.')) return false;
        return validExtensions.some(ext => lowerName.endsWith(ext));
      });
      this.pageFilesZip = files.sort((a, b) => naturalSort(a.name, b.name));
    }
  }

  getTotalPages(): number {
    return this.isRar ? this.pageFilesRar.length : this.pageFilesZip.length;
  }

  async getPageUrl(index: number): Promise<string> {
    const total = this.getTotalPages();
    if (index < 0 || index >= total) throw new Error('Invalid page index');

    if (this.isRar && this.rar) {
      const entry = this.pageFilesRar[index];
      return URL.createObjectURL(entry.file);
    } else if (this.zip) {
      const file = this.pageFilesZip[index];
      const blob = await file.async('blob');
      return URL.createObjectURL(blob);
    }
    throw new Error('Parser not loaded properly');
  }

  async getCoverUrl(): Promise<string> {
    if (this.getTotalPages() === 0) throw new Error('No pages found');
    return await this.getPageUrl(0);
  }
}
