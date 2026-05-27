import TasksPage from '../features/tasks/TasksPage';

export default function TasksView({ archiveDate }: { archiveDate?: string }) {
  return <TasksPage archiveDate={archiveDate} />;
}
