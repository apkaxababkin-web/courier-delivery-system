import type { LucideIcon } from 'lucide-react';

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
    <aside className="w-80 bg-gradient-to-b from-blue-700 to-blue-500 border-r border-gray-200 flex flex-col h-screen">
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="px-6 py-4 border-b border-blue-600">
            <h2 className="text-xl font-bold text-white">Курьерская служба Миг</h2>
            <p className="text-xs text-blue-100 mt-1">Менеджер</p>
          </div>

          {/* Menu Items */}
          <nav className="flex-1 px-4 py-6 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onViewChange(item.id);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-cyan-400 text-white font-medium'
                      : 'text-blue-100 hover:bg-blue-600'
                  }`}
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-blue-600">
            <div className="text-xs text-blue-100">
              <p>v1.0.0</p>
              <p className="mt-2">© 2026 Курьерская служба Миг</p>
            </div>
          </div>
        </div>
      </aside>
  );
}
