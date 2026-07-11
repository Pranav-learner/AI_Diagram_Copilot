import type {
  FilterOption,
  Project,
  SelectOption,
  SortOption,
} from '@/types';
import { daysSince } from './format';

/** User-facing labels for each sort option, in display order. */
export const SORT_OPTIONS: readonly SelectOption<SortOption>[] = [
  { value: 'recent', label: 'Recently modified' },
  { value: 'alphabetical', label: 'Alphabetical' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

/** User-facing labels for each filter option, in display order. */
export const FILTER_OPTIONS: readonly SelectOption<FilterOption>[] = [
  { value: 'all', label: 'All projects' },
  { value: 'last-7-days', label: 'Last 7 days' },
  { value: 'last-30-days', label: 'Last 30 days' },
  { value: 'older', label: 'Older than 30 days' },
];

/** Case-insensitive match against a project's title and description. */
function matchesSearch(project: Project, query: string): boolean {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  return (
    project.title.toLowerCase().includes(needle) ||
    project.description.toLowerCase().includes(needle)
  );
}

/** Whether a project falls within the selected time-window filter. */
function matchesFilter(
  project: Project,
  filter: FilterOption,
  now: number,
): boolean {
  if (filter === 'all') return true;
  const age = daysSince(project.updatedAt, now);
  switch (filter) {
    case 'last-7-days':
      return age <= 7;
    case 'last-30-days':
      return age <= 30;
    case 'older':
      return age > 30;
    default:
      return true;
  }
}

const compareByTitle = (a: Project, b: Project): number =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

const time = (iso: string): number => new Date(iso).getTime();

/** Return a new, sorted copy of the projects array. */
function sortProjects(projects: Project[], sort: SortOption): Project[] {
  const copy = [...projects];
  switch (sort) {
    case 'alphabetical':
      return copy.sort(compareByTitle);
    case 'newest':
      return copy.sort((a, b) => time(b.createdAt) - time(a.createdAt));
    case 'oldest':
      return copy.sort((a, b) => time(a.createdAt) - time(b.createdAt));
    case 'recent':
    default:
      return copy.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  }
}

export interface ProjectQuery {
  search: string;
  sort: SortOption;
  filter: FilterOption;
}

/**
 * Apply search, filter, and sort to a project collection. Pure and side-effect
 * free so it can be memoized in the dashboard.
 */
export function queryProjects(
  projects: Project[],
  { search, sort, filter }: ProjectQuery,
  now: number = Date.now(),
): Project[] {
  const filtered = projects.filter(
    (p) => matchesSearch(p, search) && matchesFilter(p, filter, now),
  );
  return sortProjects(filtered, sort);
}

/** The N most recently modified projects, for the "Recent" rail. */
export function getRecentProjects(projects: Project[], count = 4): Project[] {
  return [...projects]
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
    .slice(0, count);
}
