/**
 * The four screens, grouped the way they are actually used.
 *
 * They are not a sequence. You sign once, then live in the tree, then go to
 * refusals when something stops. Grouping them by what they are for beats
 * numbering them one to four and asserting a journey nobody is on.
 */
import type { IconName } from "cordon-ui";

export interface Screen {
  id: string;
  label: string;
  description: string;
  icon: IconName;
}

export interface ScreenGroup {
  title: string;
  screens: Screen[];
}

export const SCREEN_GROUPS: ScreenGroup[] = [
  {
    title: "Your tree",
    screens: [
      { id: "setup", label: "Setup", description: "sign the mandate", icon: "settings" },
      { id: "tree", label: "Tree", description: "watch the exposure", icon: "layers" },
      { id: "refusals", label: "Refusals", description: "decide, or leave it", icon: "alert" },
    ],
  },
  {
    title: "Evidence",
    screens: [
      { id: "drill", label: "Drill", description: "the measured ceiling", icon: "bolt" },
    ],
  },
];

export const SCREENS: Screen[] = SCREEN_GROUPS.flatMap((group) => group.screens);
