import localforage from 'localforage';
import type { Comic } from '../types';

localforage.config({
  name: 'ComicReaderApp',
  storeName: 'comics_library'
});

const PROGRESS_STORE = localforage.createInstance({
  name: 'ComicReaderApp',
  storeName: 'reading_progress'
});

const FILE_STORE = localforage.createInstance({
  name: 'ComicReaderApp',
  storeName: 'comic_files'
});

class StorageService {
  async saveComic(comic: Comic): Promise<void> {
    await localforage.setItem(comic.id, comic);
  }

  async getComic(id: string): Promise<Comic | null> {
    return await localforage.getItem<Comic>(id);
  }

  async getAllComics(): Promise<Comic[]> {
    const comics: Comic[] = [];
    await localforage.iterate((value: Comic) => {
      comics.push(value);
    });
    return comics.sort((a, b) => b.lastRead - a.lastRead); // Most recently read first
  }

  async deleteComic(id: string): Promise<void> {
    await localforage.removeItem(id);
    await PROGRESS_STORE.removeItem(id);
    await FILE_STORE.removeItem(id);
  }

  async saveProgress(id: string, currentPage: number, totalPages: number): Promise<void> {
    const progress = (currentPage / totalPages) * 100;
    
    // Update main comic object
    const comic = await this.getComic(id);
    if (comic) {
      comic.currentPage = currentPage;
      comic.progress = progress;
      comic.lastRead = Date.now();
      await this.saveComic(comic);
    }
  }

  async saveComicFile(id: string, file: File | Blob): Promise<void> {
    await FILE_STORE.setItem(id, file);
  }

  async getComicFile(id: string): Promise<File | Blob | null> {
    return await FILE_STORE.getItem<File | Blob>(id);
  }
}

export const storage = new StorageService();
