const fs = require('fs');

let home = fs.readFileSync('src/pages/Home.tsx', 'utf8');

const dropdownComponent = `
const SortDropdown = ({ value, onChange }: { value: string, onChange: (v: string) => void }) => {
  const [open, setOpen] = React.useState(false);
  
  const options = [
    { id: 'recent', label: 'Recentes' },
    { id: 'az', label: 'A - Z' },
    { id: 'za', label: 'Z - A' },
  ];

  const currentLabel = options.find(o => o.id === value)?.label || 'A - Z';

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setOpen(false);
    }
  };

  return (
    <div className="relative hidden sm:block" onBlur={handleBlur} tabIndex={-1}>
      <button 
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-white/8 border border-white/10 hover:bg-white/15 text-gray-300 rounded-full py-1.5 px-3 text-xs focus:outline-none transition-colors"
      >
        {currentLabel}
        <ChevronDown size={12} className={\`transition-transform \${open ? 'rotate-180' : ''}\`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-32 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col py-1">
          {options.map(opt => (
            <button
              key={opt.id}
              onClick={() => { onChange(opt.id); setOpen(false); }}
              className={\`w-full text-left px-4 py-2 text-xs transition-colors \${value === opt.id ? 'bg-[#e50914] text-white font-semibold' : 'text-gray-300 hover:bg-white/10'}\`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

`;

// Insert the component definition before `export const Home`
home = home.replace(
  /export const Home: React\.FC = \(\) => \{/,
  dropdownComponent + 'export const Home: React.FC = () => {'
);

// Replace the `<select>` in the JSX
const selectRegex = /<select[\s\S]*?<\/select>/;
home = home.replace(selectRegex, `<SortDropdown value={sortOrder} onChange={(val) => setSortOrder(val as any)} />`);

fs.writeFileSync('src/pages/Home.tsx', home);
console.log('Dropdown replaced');
