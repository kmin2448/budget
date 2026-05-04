import { Sidebar } from '@/components/layout/Sidebar';
import { SidebarProvider } from '@/components/layout/SidebarContext';
import { BudgetTypeProvider } from '@/contexts/BudgetTypeContext';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BudgetTypeProvider>
      <SidebarProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-background p-4 2xl:p-6">
            {children}
          </main>
        </div>
      </SidebarProvider>
    </BudgetTypeProvider>
  );
}
