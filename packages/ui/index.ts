/* ==========================================================================
   Cordon — a React UI system fired from one hero section.
   Every export below traces to a term in the UI glossary; the mapping lives
   in `glossary.ts` so the docs and the library cannot drift apart.
   ========================================================================== */

import "./styles/index.css";

/* ---- foundation ---------------------------------------------------------- */
export { CordonProvider, useCordon } from "./lib/CordonProvider";
export type { CordonContextValue, CordonProviderProps } from "./lib/CordonProvider";
export { cx } from "./lib/cx";
export type { ClassValue } from "./lib/cx";
export { useCordonReducedMotion } from "./hooks/useReducedMotion";
export { useCordonId } from "./hooks/useId";
export { useFocusTrap } from "./hooks/useFocusTrap";

export * from "./tokens/motion";

/* ---- primitives ---------------------------------------------------------- */
export { Surface } from "./lib/primitives/Surface";
export type { SurfaceProps, Glaze, SurfaceElevation } from "./lib/primitives/Surface";
export { Grain } from "./lib/primitives/Grain";
export type { GrainProps } from "./lib/primitives/Grain";
export { CordonDefs } from "./lib/primitives/CordonDefs";
export { DotText } from "./lib/primitives/DotText";
export type { DotTextProps } from "./lib/primitives/DotText";
export { DOT_GLYPHS, layoutDots } from "./lib/primitives/dotFont";
export type { Glyph, DotLayout, DotLayoutOptions } from "./lib/primitives/dotFont";

/* ---- components ---------------------------------------------------------- */
export { Icon, CORDON_ICONS, iconNames } from "./lib/components/Icon";
export type { IconProps, IconName } from "./lib/components/Icon";

export { Button, Cta, PlusButton, ShareButton } from "./lib/components/Button";
export type { ButtonProps, ButtonVariant, ButtonSize, CtaProps, PlusButtonProps, ShareButtonProps } from "./lib/components/Button";

export { Field, useField, fieldAria } from "./lib/components/Field";
export type { FieldProps, FieldState, FieldContextValue } from "./lib/components/Field";

export { TextField, TextArea, SearchField } from "./lib/components/TextField";
export type { TextFieldProps, TextAreaProps, SearchFieldProps } from "./lib/components/TextField";

export { Checkbox, Radio, RadioGroup, Toggle } from "./lib/components/Choice";
export type { CheckboxProps, RadioProps, RadioGroupProps, ToggleProps } from "./lib/components/Choice";

export { Slider, Stepper } from "./lib/components/Range";
export type { SliderProps, StepperProps } from "./lib/components/Range";

export { ProgressBar, Loader, StepProgress } from "./lib/components/Progress";
export type { ProgressBarProps, LoaderProps, StepProgressProps } from "./lib/components/Progress";

export { Tag } from "./lib/components/Tag";
export type { TagProps, TagTone } from "./lib/components/Tag";

export { Tooltip } from "./lib/components/Tooltip";
export type { TooltipProps, TooltipPlacement } from "./lib/components/Tooltip";

export { Notification, ToastProvider, useToast } from "./lib/components/Notification";
export type { NotificationProps, NotificationTone, Toast, ToastProviderProps } from "./lib/components/Notification";

export { Modal, MessageBox } from "./lib/components/Modal";
export type { ModalProps, MessageBoxProps } from "./lib/components/Modal";

export { Breadcrumb, Pagination, Tabs, TabBar } from "./lib/components/Navigation";
export type { BreadcrumbProps, BreadcrumbItem, PaginationProps, TabsProps, TabItem, TabBarProps, TabBarItem } from "./lib/components/Navigation";

export { Menu, DropdownButton, IconMenu, Sidebar, Drawer, MENU_GLYPH_MEANING } from "./lib/components/Menu";
export type { MenuProps, MenuItem, DropdownButtonProps, IconMenuProps, MenuGlyph, SidebarProps, SidebarSection, DrawerProps } from "./lib/components/Menu";

export { Accordion } from "./lib/components/Accordion";
export type { AccordionProps, AccordionItem } from "./lib/components/Accordion";

export { Select, ListBox } from "./lib/components/Select";
export type { SelectProps, SelectOption, ListBoxProps } from "./lib/components/Select";

export { Container, Grid, Stack, Stage } from "./lib/components/Layout";
export type { ContainerProps, GridProps, StackProps, StageProps } from "./lib/components/Layout";

export { Card, CardMedia, CardHeader, CardBody, CardFooter, MetricCard } from "./lib/components/Card";
export type { CardProps, CardMediaProps, MetricCardProps } from "./lib/components/Card";

export { TileWall, Tile } from "./lib/components/TileWall";
export type { TileWallProps, TileProps } from "./lib/components/TileWall";

export { Gauge } from "./lib/primitives/Gauge";
export type { GaugeProps } from "./lib/primitives/Gauge";

export { Carousel } from "./lib/components/Carousel";
export type { CarouselProps } from "./lib/components/Carousel";

export { Feed, CommentBox } from "./lib/components/Feed";
export type { FeedProps, FeedEntry, CommentBoxProps, Comment } from "./lib/components/Feed";

export { Calendar, DatePicker } from "./lib/components/DatePicker";
export type { CalendarProps, DatePickerProps } from "./lib/components/DatePicker";

export { Headline, Text, Logo } from "./lib/components/Typography";
export type { HeadlineProps, TextProps, LogoProps } from "./lib/components/Typography";

export { Dropzone, OtpInput, Resizable } from "./lib/components/Upload";
export type { DropzoneProps, DropzoneFile, OtpInputProps, ResizableProps } from "./lib/components/Upload";

export { Tree, Timeline } from "./lib/components/Tree";
export type { TreeProps, TreeNode, TimelineProps, TimelineEntry } from "./lib/components/Tree";

export { DataTable } from "./lib/components/DataTable";
export type { DataTableProps, Column } from "./lib/components/DataTable";

export { Sparkline } from "./lib/components/Sparkline";
export type { SparklineProps } from "./lib/components/Sparkline";

export { LineChart, BarChart, DonutChart } from "./lib/chart/Chart";
export type { LineChartProps, BarChartProps, DonutChartProps, Series, ChartGlaze } from "./lib/chart/Chart";
export { linearScale, niceStep, niceTicks, smoothPath, formatCompact, nearestIndex } from "./lib/chart/geometry";
export type { Scale, Ticks, Point } from "./lib/chart/geometry";

export { useMeasure } from "./hooks/useMeasure";
export type { Size } from "./hooks/useMeasure";

export { Bento, BentoCell } from "./lib/components/Bento";
export type { BentoProps, BentoCellProps } from "./lib/components/Bento";

export { Segmented, Avatar, AvatarGroup, Skeleton, EmptyState } from "./lib/components/Display";
export type { SegmentedProps, SegmentedOption, AvatarProps, AvatarGroupProps, SkeletonProps, EmptyStateProps } from "./lib/components/Display";

export { Sheet } from "./lib/components/Sheet";
export type { SheetProps } from "./lib/components/Sheet";

export { CommandPalette, useCommandShortcut, scoreCommand } from "./lib/components/Command";
export type { CommandPaletteProps, CommandItem } from "./lib/components/Command";

export { Kbd } from "./lib/components/Kbd";
export type { KbdProps } from "./lib/components/Kbd";

export { AnimatedNumber } from "./lib/primitives/AnimatedNumber";
export type { AnimatedNumberProps } from "./lib/primitives/AnimatedNumber";

export { usePointerField } from "./hooks/usePointerField";
export type { PointerField, PointerFieldOptions } from "./hooks/usePointerField";

export { spring } from "./tokens/spring";
export type { Density } from "./tokens/spring";

export { Form, FormSection, FormActions } from "./lib/components/Form";
export type { FormProps, FormSectionProps, FormActionsProps } from "./lib/components/Form";

export { Section } from "./lib/components/Section";

export { Preview, Enforced } from "./lib/components/Enforced";
export type { Strength } from "./lib/components/Enforced";

export { usePageMeta, useNoIndex } from "./hooks/usePageMeta";
export type { PageMeta } from "./hooks/usePageMeta";
