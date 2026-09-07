import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { Button } from "./Button";
import { TextArea } from "./TextField";
import { listItemVariants, listVariants } from "../../tokens/motion";
import { useCordon } from "../CordonProvider";
import { cx } from "../cx";

/* Glossary: "Feed", "Comment boxes". */

export interface FeedEntry {
  id: string;
  /** Who or what did it. */
  actor: ReactNode;
  /** What they did. */
  summary: ReactNode;
  detail?: ReactNode;
  timestamp?: ReactNode;
  icon?: IconName;
  avatar?: string;
}

export interface FeedProps {
  entries: FeedEntry[];
  /** Chronological, most popular, or ranked — say which, so viewers know. */
  order?: "newest" | "oldest" | "popular" | "ranked";
  /** Draws the connecting rail between entries. */
  timeline?: boolean;
  emptyState?: ReactNode;
  className?: string;
}

export function Feed({ entries, order = "newest", timeline = true, emptyState, className }: FeedProps) {
  const { reducedMotion } = useCordon();

  if (!entries.length && emptyState) {
    return <div className="cordon-feed__empty">{emptyState}</div>;
  }

  return (
    <motion.ol
      className={cx("cordon-feed", timeline && "cordon-feed--timeline", className)}
      data-order={order}
      variants={reducedMotion ? undefined : listVariants}
      initial={reducedMotion ? false : "hidden"}
      animate={reducedMotion ? undefined : "visible"}
    >
      {entries.map((entry) => (
        <motion.li key={entry.id} className="cordon-feed__entry" variants={reducedMotion ? undefined : listItemVariants}>
          <span className="cordon-feed__marker" aria-hidden="true">
            {entry.avatar ? (
              <img className="cordon-feed__avatar" src={entry.avatar} alt="" />
            ) : (
              <Icon name={entry.icon ?? "bolt"} />
            )}
          </span>
          <div className="cordon-feed__content">
            <p className="cordon-feed__summary">
              <span className="cordon-feed__actor">{entry.actor}</span> {entry.summary}
            </p>
            {entry.detail ? <div className="cordon-feed__detail">{entry.detail}</div> : null}
            {entry.timestamp ? <span className="cordon-feed__timestamp">{entry.timestamp}</span> : null}
          </div>
        </motion.li>
      ))}
    </motion.ol>
  );
}

export interface Comment {
  id: string;
  author: ReactNode;
  avatar?: string;
  body: ReactNode;
  timestamp?: ReactNode;
  likes?: number;
  liked?: boolean;
  replies?: Comment[];
}

export interface CommentBoxProps {
  comments: Comment[];
  /** `popular` sorts by likes; `newest` leaves the given order alone. */
  order?: "newest" | "popular";
  onSubmit?: (body: string) => void;
  onLike?: (id: string) => void;
  onReply?: (id: string) => void;
  placeholder?: string;
  className?: string;
}

/** Glossary: "Comment boxes". One level of replies — deeper nesting lies. */
export function CommentBox({
  comments,
  order = "newest",
  onSubmit,
  onLike,
  onReply,
  placeholder = "Add a comment…",
  className,
}: CommentBoxProps) {
  const ordered =
    order === "popular" ? [...comments].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)) : comments;

  const renderComment = (comment: Comment, nested = false) => (
    <li key={comment.id} className={cx("cordon-comment", nested && "cordon-comment--nested")}>
      <span className="cordon-comment__avatar" aria-hidden="true">
        {comment.avatar ? <img src={comment.avatar} alt="" /> : <Icon name="user" />}
      </span>
      <div className="cordon-comment__content">
        <p className="cordon-comment__meta">
          <span className="cordon-comment__author">{comment.author}</span>
          {comment.timestamp ? <span className="cordon-comment__timestamp">{comment.timestamp}</span> : null}
        </p>
        <div className="cordon-comment__body">{comment.body}</div>
        <div className="cordon-comment__actions">
          <button
            type="button"
            className={cx("cordon-comment__action", comment.liked && "cordon-comment__action--on")}
            onClick={() => onLike?.(comment.id)}
          >
            <Icon name="heart" />
            {comment.likes ? <span>{comment.likes}</span> : null}
          </button>
          <button type="button" className="cordon-comment__action" onClick={() => onReply?.(comment.id)}>
            Reply
          </button>
        </div>
        {comment.replies?.length ? (
          <ul className="cordon-comment__replies">{comment.replies.map((reply) => renderComment(reply, true))}</ul>
        ) : null}
      </div>
    </li>
  );

  return (
    <div className={cx("cordon-commentbox", className)}>
      {onSubmit ? (
        <form
          className="cordon-commentbox__composer"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const field = form.elements.namedItem("comment") as HTMLTextAreaElement | null;
            if (field?.value.trim()) {
              onSubmit(field.value.trim());
              field.value = "";
            }
          }}
        >
          <TextArea name="comment" rows={3} placeholder={placeholder} aria-label="Comment" />
          <div className="cordon-commentbox__composer-actions">
            <Button type="submit" variant="primary" size="sm">
              Post
            </Button>
          </div>
        </form>
      ) : null}

      <ul className="cordon-commentbox__list">{ordered.map((comment) => renderComment(comment))}</ul>
    </div>
  );
}
