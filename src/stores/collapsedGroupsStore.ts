import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Category groups collapsed on Budget and Set budgets, remembered on this device only. */
interface CollapsedGroupsStore {
  collapsedGroupIds: string[];
  toggleGroup: (groupId: string) => void;
}

export const useCollapsedGroupsStore = create<CollapsedGroupsStore>()(
  persist(
    (set) => ({
      collapsedGroupIds: [],
      toggleGroup: (groupId) =>
        set(({ collapsedGroupIds }) => ({
          collapsedGroupIds: collapsedGroupIds.includes(groupId)
            ? collapsedGroupIds.filter((id) => id !== groupId)
            : [...collapsedGroupIds, groupId],
        })),
    }),
    {
      name: "collapsed-groups",
      partialize: (state) => ({ collapsedGroupIds: state.collapsedGroupIds }),
    }
  )
);
