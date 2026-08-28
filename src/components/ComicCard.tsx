import React from 'react';
import type { Comic } from '../types';
import { Play } from 'lucide-react';

interface Props {
  comic: Comic;
  onClick: (comic: Comic) => void;
}

export const ComicCard: React.FC<Props> = ({ comic, onClick }) => {
  return (
    <div 
      className="group relative cursor-pointer transition-transform duration-300 hover:scale-105"
      onClick={() => onClick(comic)}
    >
      <div className="aspect-[2/3] rounded-md overflow-hidden bg-[#2f2f2f] relative shadow-lg">
        {comic.coverImage ? (
          <img 
            src={comic.coverImage} 
            alt={comic.title} 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            Sem capa
          </div>
        )}
        
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Play fill="white" className="w-12 h-12 text-white" />
        </div>
        
        {/* Progress bar */}
        {comic.progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
            <div 
              className="h-full bg-netflix-red" 
              style={{ width: `${comic.progress}%` }} 
            />
          </div>
        )}
      </div>
      
      <div className="mt-2">
        <h3 className="text-sm font-semibold truncate text-white">{comic.title}</h3>
        {comic.progress > 0 ? (
          <p className="text-xs text-gray-400">{Math.round(comic.progress)}% lido</p>
        ) : (
          <p className="text-xs text-gray-400">Não iniciado</p>
        )}
      </div>
    </div>
  );
};
