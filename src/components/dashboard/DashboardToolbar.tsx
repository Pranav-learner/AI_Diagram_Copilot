import { ArrowUpDown, LayoutGrid, List, ListFilter, Plus } from 'lucide-react';
import { useProjectStore } from '@/store';
import { FILTER_OPTIONS, SORT_OPTIONS } from '@/utils';
import { Button } from '@/components/ui/button';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import { OptionSelect, SearchInput } from '@/components/common';

/**
 * Controls above the project collection: search, sort, filter, grid/list
 * toggle, and the primary "New Diagram" action. All state lives in the project
 * store so the toolbar is fully controlled and stateless itself.
 */
export function DashboardToolbar() {
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const setSearchQuery = useProjectStore((s) => s.setSearchQuery);
  const sortOption = useProjectStore((s) => s.sortOption);
  const setSortOption = useProjectStore((s) => s.setSortOption);
  const filterOption = useProjectStore((s) => s.filterOption);
  const setFilterOption = useProjectStore((s) => s.setFilterOption);
  const viewMode = useProjectStore((s) => s.viewMode);
  const setViewMode = useProjectStore((s) => s.setViewMode);
  const openCreateDialog = useProjectStore((s) => s.openCreateDialog);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search diagrams…"
        aria-label="Search diagrams"
        className="w-full lg:max-w-xs"
      />

      <div className="flex flex-wrap items-center gap-2">
        <OptionSelect
          value={filterOption}
          onChange={setFilterOption}
          options={FILTER_OPTIONS}
          ariaLabel="Filter diagrams"
          icon={<ListFilter className="size-4 shrink-0 opacity-70" />}
          className="w-[9.5rem]"
        />
        <OptionSelect
          value={sortOption}
          onChange={setSortOption}
          options={SORT_OPTIONS}
          ariaLabel="Sort diagrams"
          icon={<ArrowUpDown className="size-4 shrink-0 opacity-70" />}
          className="w-[11rem]"
        />

        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => {
            if (value === 'grid' || value === 'list') setViewMode(value);
          }}
          aria-label="View mode"
        >
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <LayoutGrid />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            <List />
          </ToggleGroupItem>
        </ToggleGroup>

        <Button onClick={openCreateDialog} className="ml-auto lg:ml-0">
          <Plus />
          <span className="hidden sm:inline">New Diagram</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>
    </div>
  );
}
