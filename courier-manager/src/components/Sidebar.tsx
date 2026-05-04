import type { LucideIcon } from 'lucide-react';
import { Truck } from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface SidebarProps {
  menuItems: MenuItem[];
  activeView: string;
  onViewChange: (view: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({
  menuItems,
  activeView,
  onViewChange,
}: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 w-[280px] h-screen bg-slate-900 border-r border-slate-800 flex flex-col z-40">
      <div className="h-full flex flex-col">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-slate-800">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Courier</h2>
              <p className="text-xs text-slate-400">Manager</p>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onViewChange(item.id);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600 text-white font-medium shadow-lg shadow-blue-600/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon size={20} className="flex-shrink-0" />
                <span className="text-sm">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800">
          <div className="text-xs text-slate-500 space-y-1">
            <p className="font-medium">v1.2.5</p>
            <p className="text-slate-600">© 2026</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
