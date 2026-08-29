import React from 'react';
import type { Comic } from '../types';
import { Play, BookOpen } from 'lucide-react';

interface Props {
  comic: Comic;
  onClick: (comic: Comic) => void;
}

export const ComicCard: React.FC<Props> = ({ comic, onClick }) => {
  const prog = comic.progress ?? 0;

  return (
    <div
      className="group relative cursor-pointer"
      onClick={() => onClick(comic)}
    >
      {/* Cover */}
      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-[#1e1e1e] relative shadow-xl ring-1 ring-white/5 transition-all duration-300 group-hover:ring-[#e50914]/60 group-hover:shadow-[0_0_24px_rgba(229,9,20,0.25)] group-hover:scale-[1.03]">
        {comic.coverImage ? (
          <img
            src={comic.coverImage}
            alt={comic.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-600">
            <BookOpen size={32} />
            <span className="text-xs text-center px-2">{comic.title}</span>
          </div>
        )}

        {/* Dark gradient at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-200">
            <Play fill="#141414" className="w-5 h-5 ml-0.5" />
          </div>
        </div>

        {/* Progress bar */}
        {prog > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gray-700/80">
            <div
              className="h-full bg-[#e50914] rounded-full"
              style={{ width: `${prog}%` }}
            />
          </div>
        )}

        {/* Badge: progress % */}
        {prog > 0 && prog < 100 && (
          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {Math.round(prog)}%
          </div>
        )}
        {prog >= 100 && (
          <div className="absolute top-2 right-2 bg-[#e50914]/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            ✓ Lido
          </div>
        )}
      </div>

      {/* Title */}
      <div className="mt-2 px-0.5">
        <h3 className="text-xs md:text-sm font-medium truncate text-gray-200 group-hover:text-white transition-colors">
          {comic.title}
        </h3>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {comic.totalPages ? `${comic.totalPages} pág.` : ''}
          {prog > 0 && prog < 100 ? ` · Em andamento` : ''}
        </p>
      </div>
    </div>
  );
};
